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
        zoom: 4,
        center: centroBR,
        disableDefaultUI: false
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
            autocomplete.addListener('place_changed', () => {
                calcularRota();
            });
            // Adiciona gatilho ao perder o foco também
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
            origin: pontoVazio,
            destination: origem,
            travelMode: 'DRIVING'
        }, (res, status) => {
            if (status === 'OK') {
                distVazioMetros = res.routes[0].legs[0].distance.value;
            } else {
                distVazioMetros = 0;
            }
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
        origin: origem,
        destination: destino,
        waypoints: waypoints,
        travelMode: 'DRIVING',
        optimizeWaypoints: true
    }, (res, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(res);
            distRotaMetros = res.routes[0].legs.reduce((acc, leg) => acc + leg.distance.value, 0);
            processarSegmentosRota(res);
        }
    });
}

// --- CÁLCULOS FINANCEIROS ---
function parseMoeda(valor) {
    if (!valor) return 0;
    // Remove R$, pontos de milhar e espaços, sobrando apenas a vírgula
    let limpo = valor.toString().replace(/R\$\s?/, "").replace(/\./g, "").replace(/\s/g, "");
    // Troca a vírgula por ponto para o JS entender como número decimal
    limpo = limpo.replace(",", ".");
    return parseFloat(limpo) || 0;
}

function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, ""); // Remove tudo que não é número
    if (valor === "") { input.value = ""; return; }
    valor = (parseFloat(valor) / 100).toFixed(2); // Faz o "1 = 0,01"
    input.value = "R$ " + valor.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}
function atualizarFinanceiro() {
    if (!rotaIniciada) return;

    try {
        const kmTotal = (distRotaMetros / 1000) || 0;
        const kmVazio = (distVazioMetros / 1000) || 0;
        const kmGeral = kmTotal + kmVazio;

        // --- LEITURA DE INPUTS ---
        const dieselL = parseMoeda(document.getElementById("custoDieselLitro").value);
        const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
        const arlaL = parseMoeda(document.getElementById("custoArlaLitro").value);
        const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
        const pedagio = parseMoeda(document.getElementById("custoPedagio").value);
        const manutKm = parseMoeda(document.getElementById("custoManutencaoKm").value);
        const freteKmInput = parseMoeda(document.getElementById("valorPorKm").value);
        const vDescarga = parseMoeda(document.getElementById("valorDescarga").value);
        const vOutras = parseMoeda(document.getElementById("valorOutrasDespesas").value);
        
        // Pega o fator do imposto (Ex: 0.88 para 12%)
        const impostoFator = parseFloat(document.getElementById("imposto").value) || 0;

        // --- CÁLCULO DO DESLOCAMENTO ---
        let valorDeslocamentoFinal = 0;
        const tipoDesloc = document.getElementById("tipoDeslocamento").value;
        
        if (tipoDesloc === "remunerado_km") {
            const vKmDesloc = parseMoeda(document.getElementById("valorDeslocamentoKm").value);
            valorDeslocamentoFinal = kmVazio * vKmDesloc;
        } else if (tipoDesloc === "remunerado_rs") {
            valorDeslocamentoFinal = parseMoeda(document.getElementById("valorDeslocamentoTotal").value);
        }

        // --- RECEITA E IMPOSTO ---
        const freteBase = freteKmInput * kmTotal;
        const subTotal = freteBase + valorDeslocamentoFinal + vDescarga + vOutras;
        
        let freteTotal = subTotal;
        let valorImposto = 0;

        if (impostoFator > 0 && impostoFator < 1) {
            // Cálculo por dentro: Faturamento Bruto = Líquido / (1 - Imposto)
            freteTotal = subTotal / impostoFator;
            valorImposto = freteTotal - subTotal;
        }

        // --- CUSTOS ---
        const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
        const custoArla = (consumoM > 0) ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
        const custoManut = kmGeral * manutKm;
        const totalCustos = custoCombustivel + custoArla + custoManut + pedagio;
        const lucro = subTotal - totalCustos; // Lucro sobre o valor líquido

        // --- ATUALIZAR UI ---
        const opt = { style: 'currency', currency: 'BRL' };
        
        // Atualiza os textos de resumo
        document.getElementById("txt-km-total").innerText = kmGeral.toFixed(1) + " km";
        document.getElementById("txt-frete-base").innerText = freteBase.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-deslocamento-fin").innerText = valorDeslocamentoFinal.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-imp").innerText = valorImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-frete-total").innerText = freteTotal.toLocaleString('pt-BR', opt);
        document.getElementById("txt-total-custos").innerText = totalCustos.toLocaleString('pt-BR', opt);
        document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);

    } catch (e) {
        console.error("Erro no cálculo:", e);
    }
}

// --- INTERFACE E EVENTOS ---
document.addEventListener("DOMContentLoaded", function() {
    // A. Formatação Dinâmica (1 = 0,01)
    const camposMoeda = ["valorDeslocamentoKm", "valorDeslocamentoTotal", "valorPorKm", "valorDescarga", "valorOutrasDespesas", "custoDieselLitro", "custoArlaLitro", "custoPedagio", "custoManutencaoKm"];
    
    camposMoeda.forEach(id => {
        document.getElementById(id)?.addEventListener('input', function() {
            formatarMoeda(this); 
        });
    });

    // B. Monitor de Inputs para Recalcular
    const inputsFinanceiros = [...camposMoeda, "consumoDieselMedia", "arlaPorcentagem", "consumoFrioHora"];
    inputsFinanceiros.forEach(id => {
        document.getElementById(id)?.addEventListener('input', atualizarFinanceiro);
    });

    // C. Gatilhos de Seleção
    document.getElementById("imposto")?.addEventListener('change', atualizarFinanceiro);
    document.getElementById("tipoCarga")?.addEventListener('change', function() {
        toggleAparelhoFrio();
        atualizarFinanceiro();
    });

    // D. Lógica de Deslocamento
    const selectDesloc = document.getElementById("tipoDeslocamento");
    selectDesloc?.addEventListener('change', function() {
        document.getElementById("valorDeslocamentoKm").style.display = (this.value === "remunerado_km") ? "block" : "none";
        document.getElementById("valorDeslocamentoTotal").style.display = (this.value === "remunerado_rs") ? "block" : "none";
        atualizarFinanceiro();
    });

    // E. Campo de Saída
    const campoSaida = document.getElementById("saida");
    campoSaida?.addEventListener('input', function() {
        const container = document.getElementById("container-config-deslocamento");
        if(this.value.trim() !== "") {
            container.style.display = "flex";
        } else {
            container.style.display = "none";
            if(selectDesloc) selectDesloc.value = "nao_remunerado";
            atualizarFinanceiro();
        }
    });
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
    li.innerHTML = `
        <span class="handle">☰</span>
        <input type="text" class="parada-input" placeholder="Parada intermediária..." autocomplete="off">
        <button onclick="this.parentElement.remove(); calcularRota();" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
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
        manut: document.getElementById("f-manut").value
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
            <div><strong>${v.nome}</strong></div>
            <button onclick="selecionarVeiculo(${v.id})">Selecionar</button>
            <button onclick="excluirVeiculo(${v.id})" style="background:red; color:white;">×</button>
        </div>
    `).join('');
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
    sel.innerHTML = '<option value="">-- Selecione --</option>' + 
        frota.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
}

function vincularFrota(elem) {
    selecionarVeiculo(parseInt(elem.value));
}

function processarSegmentosRota(res) {
    const leg = res.routes[0].legs[0];
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    listaEscrita.innerHTML = `<div style="padding:10px;"><strong>Origem:</strong> ${leg.start_address}<br><strong>Destino:</strong> ${leg.end_address}</div>`;
    atualizarFinanceiro();
}




