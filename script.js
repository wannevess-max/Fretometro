let map, directionsRenderer, directionsService, rotaIniciada = false;
let distVazioMetros = 0, distRotaMetros = 0;
let frota = JSON.parse(localStorage.getItem('frota_db')) || [];

// --- INICIALIZAÇÃO DO MAPA ---
function initMap() {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#2563eb', strokeOpacity: 0.8, strokeWeight: 5 }
    });

    const centroBR = { lat: -15.793889, lng: -47.882778 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 4, center: centroBR, disableDefaultUI: false
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
    restaurarPosicaoPaineis();
}

function setupAutocomplete() {
    const inputs = ["origem", "destino", "saida"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const autocomplete = new google.maps.places.Autocomplete(el);
            autocomplete.addListener('place_changed', () => { calcularRota(); });
            el.addEventListener('blur', calcularRota);
        }
    });
}

// --- LÓGICA DE ROTAS ---
function calcularRota() {
    const origem = document.getElementById("origem").value;
    const destino = document.getElementById("destino").value;
    const pontoVazio = document.getElementById("saida").value;
    if (!origem || !destino) return;
    rotaIniciada = true;
    if (pontoVazio) {
        directionsService.route({
            origin: pontoVazio, destination: origem, travelMode: 'DRIVING'
        }, (res, status) => {
            distVazioMetros = (status === 'OK') ? res.routes[0].legs[0].distance.value : 0;
            executarRotaPrincipal(origem, destino);
        });
    } else {
        distVazioMetros = 0;
        executarRotaPrincipal(origem, destino);
    }
}

function executarRotaPrincipal(origem, destino) {
    const paradasNodes = document.querySelectorAll(".parada-input");
    const waypoints = [];
    paradasNodes.forEach(node => {
        if (node.value) waypoints.push({ location: node.value, stopover: true });
    });
    directionsService.route({
        origin: origem, destination: destino, waypoints: waypoints,
        travelMode: 'DRIVING', optimizeWaypoints: true
    }, (res, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(res);
            distRotaMetros = res.routes[0].legs.reduce((acc, leg) => acc + leg.distance.value, 0);
            processarSegmentosRota(res);
        }
    });
}

// --- CÁLCULOS FINANCEIROS (CORREÇÃO 1 VIRA 0,01) ---

function parseMoeda(valor) {
    if (!valor) return 0;
    let limpo = valor.toString().replace(/R\$\s?|[.]|\s/g, "").replace(",", ".");
    return parseFloat(limpo) || 0;
}

function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, "");
    if (!valor) { input.value = ""; return; }
    // AQUI ESTÁ A LÓGICA QUE VOCÊ PEDIU: 1 / 100 = 0.01
    let resultado = (parseFloat(valor) / 100).toFixed(2);
    input.value = "R$ " + resultado.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

function atualizarFinanceiro() {
    if (!rotaIniciada) return;
    try {
        const kmTotal = (distRotaMetros / 1000);
        const kmVazio = (distVazioMetros / 1000);
        const kmGeral = kmTotal + kmVazio;

        const dieselL = parseMoeda(document.getElementById("custoDieselLitro").value);
        const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
        const arlaL = parseMoeda(document.getElementById("custoArlaLitro").value);
        const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
        const pedagio = parseMoeda(document.getElementById("custoPedagio").value);
        const manutKm = parseMoeda(document.getElementById("custoManutencaoKm").value);
        const freteKmInput = parseMoeda(document.getElementById("valorPorKm").value);
        const vDescarga = parseMoeda(document.getElementById("valorDescarga").value);
        const vOutras = parseMoeda(document.getElementById("valorOutrasDespesas").value);

        // DESLOCAMENTO FUNCIONANDO NO RESUMO
        // Cálculo do Deslocamento
let vDeslocFinal = 0;
const tipoD = document.getElementById("tipoDeslocamento").value;
const kmVazio = (distVazioMetros / 1000) || 0;

if (tipoD === "remunerado_km") {
    // Pega o R$ 0,01, limpa e multiplica pelo KM Vazio
    const valorKmD = parseMoeda(document.getElementById("valorDeslocamentoKm").value);
    vDeslocFinal = kmVazio * valorKmD;
} else if (tipoD === "remunerado_rs") {
    vDeslocFinal = parseMoeda(document.getElementById("valorDeslocamentoTotal").value);
}

// Injeta o resultado no resumo
document.getElementById("txt-valor-deslocamento-fin").innerText = vDeslocFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const freteBase = freteKmInput * kmTotal;
        const baseCalculoImposto = freteBase + valorDeslocamentoFinal + vDescarga + vOutras;
        
        const impostoFator = parseFloat(document.getElementById("imposto").value) || 1;
        let freteTotal = baseCalculoImposto;
        let valorImposto = 0;
        if (impostoFator < 1) {
            freteTotal = baseCalculoImposto / impostoFator;
            valorImposto = freteTotal - baseCalculoImposto;
        }

        const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
        const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
        const custoManut = kmGeral * manutKm;
        
        let custoFrio = 0;
        if(document.getElementById("tipoCarga").value === "frigorifica") {
            const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
            custoFrio = consH * dieselL * 5; 
        }

        const totalCustos = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
        const lucro = baseCalculoImposto - totalCustos;

        const opt = { style: 'currency', currency: 'BRL' };
        document.getElementById("txt-km-total").innerText = kmGeral.toFixed(1) + " km";
        document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
        document.getElementById("txt-km-rota-det").innerText = kmTotal.toFixed(1) + " km";
        document.getElementById("txt-frete-base").innerText = freteBase.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-deslocamento-fin").innerText = valorDeslocamentoFinal.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-imp").innerText = valorImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-frete-total").innerText = freteTotal.toLocaleString('pt-BR', opt);
        
        if(document.getElementById("txt-an-diesel")) {
            document.getElementById("txt-an-diesel").innerText = custoCombustivel.toLocaleString('pt-BR', opt);
            document.getElementById("txt-an-arla").innerText = custoArla.toLocaleString('pt-BR', opt);
            document.getElementById("txt-an-pedagio").innerText = pedagio.toLocaleString('pt-BR', opt);
            document.getElementById("txt-an-manut").innerText = custoManut.toLocaleString('pt-BR', opt);
            document.getElementById("txt-total-custos").innerText = totalCustos.toLocaleString('pt-BR', opt);
            document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);
        }

        const pVazio = kmGeral > 0 ? (kmVazio / kmGeral) * 100 : 0;
        document.getElementById("visual-vazio").style.width = pVazio + "%";
        document.getElementById("visual-rota").style.width = (100 - pVazio) + "%";
        document.getElementById("perc-vazio").innerText = pVazio.toFixed(0) + "%";
        document.getElementById("perc-rota").innerText = (100 - pVazio).toFixed(0) + "%";

    } catch (e) { console.error("Erro financeiro:", e); }
}

// --- INTERFACE E EVENTOS ---
document.addEventListener("DOMContentLoaded", function() {
    const camposMoeda = ["valorDeslocamentoKm", "valorDeslocamentoTotal", "valorPorKm", "valorDescarga", "valorOutrasDespesas", "custoDieselLitro", "custoArlaLitro", "custoPedagio", "custoManutencaoKm"];
    camposMoeda.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function() {
                formatarMoeda(this);
                atualizarFinanceiro();
            });
        }
    });
    document.getElementById("imposto")?.addEventListener('change', atualizarFinanceiro);
    document.getElementById("tipoDeslocamento")?.addEventListener('change', atualizarFinanceiro);
});

function toggleCustos() {
    document.body.classList.toggle('custos-open');
    const isOpen = document.body.classList.contains('custos-open');
    localStorage.setItem('keep_custos', isOpen);
    if (isOpen) carregarSelectFrota();
    setTimeout(() => { if(map) google.maps.event.trigger(map, 'resize'); }, 300);
}

function toggleFrota() { 
    const painel = document.getElementById('painel-frota');
    painel.classList.toggle('active');
    renderFrota();
}

function toggleGoogleMaps() {
    const painel = document.getElementById('painel-roteiro-escrito');
    painel.classList.toggle('active');
    localStorage.setItem('keep_roteiro', painel.classList.contains('active'));
}

function restaurarPosicaoPaineis() {
    if (localStorage.getItem('keep_roteiro') === 'true') document.getElementById('painel-roteiro-escrito')?.classList.add('active');
    if (localStorage.getItem('keep_custos') === 'true') {
        document.body.classList.add('custos-open');
        carregarSelectFrota();
    }
}

function toggleAparelhoFrio() {
    const tipo = document.getElementById("tipoCarga").value;
    const isFrio = tipo === "frigorifica";
    document.getElementById("container-frio-input").style.display = isFrio ? "block" : "none";
    document.getElementById("row-an-frio").style.display = isFrio ? "flex" : "none";
    document.getElementById("container-frio-datas").style.display = isFrio ? "block" : "none";
    atualizarFinanceiro();
}

function adicionarParada() {
    const container = document.getElementById("lista-pontos");
    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `<span class="handle">☰</span><input type="text" class="parada-input" placeholder="Parada intermediária..." autocomplete="off"><button onclick="this.parentElement.remove(); calcularRota();" style="background:none; border:none; color:red; cursor:pointer;">×</button>`;
    container.insertBefore(li, document.getElementById("li-destino"));
    const autocomplete = new google.maps.places.Autocomplete(li.querySelector("input"));
    autocomplete.addListener('place_changed', calcularRota);
}

function salvarVeiculo() {
    const nome = document.getElementById("f-nome").value;
    if(!nome) return;
    const v = { id: Date.now(), nome: nome, media: document.getElementById("f-consumo").value, manut: document.getElementById("f-manut").value };
    frota.push(v);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
}

function renderFrota() {
    const list = document.getElementById("lista-v-render");
    if(!list) return;
    list.innerHTML = frota.map(v => `<div class="veiculo-card"><div><strong>${v.nome}</strong></div><button onclick="selecionarVeiculo(${v.id})">Selecionar</button><button onclick="excluirVeiculo(${v.id})" style="background:red; color:white;">×</button></div>`).join('');
}

function selecionarVeiculo(id) {
    const v = frota.find(x => x.id === id);
    if(v) {
        document.getElementById("consumoDieselMedia").value = v.media;
        document.getElementById("custoManutencaoKm").value = v.manut;
        atualizarFinanceiro();
        toggleFrota();
    }
}

function excluirVeiculo(id) {
    frota = frota.filter(x => x.id !== id);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
}

function carregarSelectFrota() {
    const sel = document.getElementById('selFrotaVinculo');
    if(!sel) return;
    sel.innerHTML = '<option value="">-- Selecione --</option>' + frota.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
}

function vincularFrota(elem) { selecionarVeiculo(parseInt(elem.value)); }

function processarSegmentosRota(res) {
    const leg = res.routes[0].legs[0];
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    listaEscrita.innerHTML = `<div style="padding:10px;"><strong>Origem:</strong> ${leg.start_address}<br><strong>Destino:</strong> ${leg.end_address}</div>`;
    atualizarFinanceiro();
}

