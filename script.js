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
    
    const el = document.getElementById('lista-pontos');
    if (el && typeof Sortable !== 'undefined') {
        Sortable.create(el, { handle: '.handle', animation: 150, onEnd: calcularRota });
    }
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

// --- FORMATAÇÃO E PARSE (CORRIGIDOS PARA IDENTIDADE TOTAL) ---
function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, "");
    if (!valor || valor === "0") {
        input.value = "R$ 0,00";
        return;
    }
    let valorNumerico = (parseFloat(valor) / 100).toFixed(2);
    input.value = "R$ " + valorNumerico
        .replace(".", ",")
        .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

function parseMoeda(valor) {
    if (!valor || valor === "R$ 0,00") return 0;
    let limpo = valor.toString().replace(/R\$\s?|[.]|\s/g, "").replace(",", ".");
    return parseFloat(limpo) || 0;
}

// --- CÁLCULOS FINANCEIROS ---
function atualizarFinanceiro() {
    if (!rotaIniciada) return;

    try {
        const kmTotal = (distRotaMetros / 1000) || 0;
        const kmVazio = (distVazioMetros / 1000) || 0;
        const kmGeral = kmTotal + kmVazio;

        // Custos e Frete Base
        const dieselL = parseMoeda(document.getElementById("custoDieselLitro").value);
        const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
        const arlaL = parseMoeda(document.getElementById("custoArlaLitro").value);
        const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
        const pedagio = parseMoeda(document.getElementById("custoPedagio").value);
        const manutKm = parseMoeda(document.getElementById("custoManutencaoKm").value);
        const freteKmInput = parseMoeda(document.getElementById("valorPorKm").value);
        const vDescarga = parseMoeda(document.getElementById("valorDescarga").value);
        const vOutras = parseMoeda(document.getElementById("valorOutrasDespesas").value);
        const impostoFator = parseFloat(document.getElementById("imposto").value) || 1;

        // --- LÓGICA DE DESLOCAMENTO REMUNERADO ---
        let valorDeslocamentoFinal = 0;
        const tipoDesloc = document.getElementById("tipoDeslocamento").value;
        const boxKm = document.getElementById("box-valor-deslocamento-km");
        const boxTotal = document.getElementById("box-valor-deslocamento-total");

        // Mostra/Esconde os campos
        if(boxKm) boxKm.style.display = (tipoDesloc === "remunerado_km") ? "block" : "none";
        if(boxTotal) boxTotal.style.display = (tipoDesloc === "remunerado_rs") ? "block" : "none";

        if (tipoDesloc === "remunerado_km") {
            const valInputKm = parseMoeda(document.getElementById("inputValorDeslocamentoKm").value);
            valorDeslocamentoFinal = kmVazio * valInputKm;
        } else if (tipoDesloc === "remunerado_rs") {
            valorDeslocamentoFinal = parseMoeda(document.getElementById("inputValorDeslocamentoTotal").value);
        }

        // --- CÁLCULOS FINAIS ---
        const freteBaseCarregado = freteKmInput * kmTotal;
        // O Total agora soma: Frete Base + Deslocamento + Descarga + Outras
        const totalBruto = freteBaseCarregado + valorDeslocamentoFinal + vDescarga + vOutras;
        
        let freteTotalComImposto = totalBruto;
        let valorImposto = 0;
        if (impostoFator < 1) {
            freteTotalComImposto = totalBruto / impostoFator;
            valorImposto = freteTotalComImposto - totalBruto;
        }

        // Custos Operacionais
        const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
        const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
        const custoManut = kmGeral * manutKm;
        const totalCustos = custoCombustivel + custoArla + custoManut + pedagio;
        const lucro = totalBruto - totalCustos;

        // --- ATUALIZAÇÃO DA TELA ---
        const opt = { style: 'currency', currency: 'BRL' };
        document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
        document.getElementById("txt-km-rota-det").innerText = kmTotal.toFixed(1) + " km";
        document.getElementById("txt-km-total").innerText = kmGeral.toFixed(1) + " km";
        document.getElementById("txt-frete-base").innerText = freteBaseCarregado.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-deslocamento-fin").innerText = valorDeslocamentoFinal.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-imp").innerText = valorImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-frete-total").innerText = freteTotalComImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);
        document.getElementById("txt-km-real").innerText = (kmGeral > 0 ? (totalBruto / kmGeral) : 0).toLocaleString('pt-BR', opt);

    } catch (e) { console.error("Erro no cálculo:", e); }
}

// --- EVENT LISTENER ---
document.addEventListener("DOMContentLoaded", function() {
    const camposMoeda = [
        "valorDeslocamentoKm", "valorDeslocamentoTotal", "valorPorKm", 
        "valorDescarga", "valorOutrasDespesas", "custoDieselLitro", 
        "custoArlaLitro", "custoPedagio", "custoManutencaoKm", "f-manut"
    ];
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
    document.getElementById("tipoCarga")?.addEventListener('change', toggleAparelhoFrio);
    
    const themeBtn = document.getElementById("themeBtn");
    if(themeBtn) {
        themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark-mode");
            localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
        });
        if(localStorage.getItem("theme") === "dark") document.body.classList.add("dark-mode");
    }
});

// --- FUNÇÕES DE INTERFACE ---
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
    const containerFrioInput = document.getElementById("container-frio-input");
    const rowAnFrio = document.getElementById("row-an-frio");
    const containerFrioDatas = document.getElementById("container-frio-datas");
    
    if(containerFrioInput) containerFrioInput.style.display = isFrio ? "block" : "none";
    if(rowAnFrio) rowAnFrio.style.display = isFrio ? "flex" : "none";
    if(containerFrioDatas) containerFrioDatas.style.display = isFrio ? "block" : "none";
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

// --- GESTÃO DE FROTA ---
function salvarVeiculo() {
    const nome = document.getElementById("f-nome").value;
    if(!nome) return;
    const v = { 
        id: Date.now(), 
        nome: nome, 
        media: document.getElementById("f-consumo").value, 
        manut: document.getElementById("f-manut").value,
        eixos: document.getElementById("f-eixos").value,
        arla: document.getElementById("f-arla").value,
        temFrio: document.getElementById("f-tem-frio").checked,
        consumoFrio: document.getElementById("f-consumo-frio").value
    };
    frota.push(v);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
}

function renderFrota() {
    const list = document.getElementById("lista-v-render");
    if(!list) return;
    list.innerHTML = frota.map(v => `
        <div class="veiculo-card">
            <div><strong>${v.nome}</strong> (${v.eixos} eixos)</div>
            <button onclick="selecionarVeiculo(${v.id})">Selecionar</button>
            <button onclick="excluirVeiculo(${v.id})" style="background:red; color:white; border:none; border-radius:4px;">×</button>
        </div>
    `).join('');
}

function selecionarVeiculo(id) {
    const v = frota.find(x => x.id === id);
    if(v) {
        document.getElementById("consumoDieselMedia").value = v.media;
        document.getElementById("custoManutencaoKm").value = v.manut;
        document.getElementById("arlaPorcentagem").value = v.arla || 5;
        if(v.temFrio) {
            document.getElementById("tipoCarga").value = "frigorifica";
            document.getElementById("consumoFrioHora").value = v.consumoFrio;
            toggleAparelhoFrio();
        } else {
            document.getElementById("tipoCarga").value = "seca";
            toggleAparelhoFrio();
        }
        atualizarFinanceiro();
        if(document.getElementById('painel-frota').classList.contains('active')) toggleFrota();
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
    sel.innerHTML = '<option value="">-- Selecione Veículo --</option>' + frota.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
}

function vincularFrota(elem) { 
    if(elem.value) selecionarVeiculo(parseInt(elem.value)); 
}

function processarSegmentosRota(res) {
    const leg = res.routes[0].legs[0];
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    if(listaEscrita) {
        listaEscrita.innerHTML = `<div style="padding:10px;"><strong>Origem:</strong> ${leg.start_address}<br><strong>Destino:</strong> ${leg.end_address}<br><strong>Duração:</strong> ${leg.duration.text}</div>`;
    }
    atualizarFinanceiro();
}

function limparPainelCustos() {
    ["custoDieselLitro", "consumoDieselMedia", "custoArlaLitro", "arlaPorcentagem", "custoPedagio", "custoManutencaoKm", "consumoFrioHora", "prevColeta", "prevEntrega"].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = "";
    });
    const selFrota = document.getElementById("selFrotaVinculo");
    if(selFrota) selFrota.value = "";
    const tipoCarga = document.getElementById("tipoCarga");
    if(tipoCarga) tipoCarga.value = "seca";
    toggleAparelhoFrio();
    atualizarFinanceiro();
}

