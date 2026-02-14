let map, directionsRenderer, directionsService, paradasData = {}, rotaIniciada = false;
let distVazioMetros = 0, distRotaMetros = 0;
let frota = JSON.parse(localStorage.getItem('frota_db')) || [];

const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] }, 
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] }, 
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] }, 
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }, 
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
];

// --- FUNÇÕES DE INTERFACE ---

function toggleFrota() { 
    const painel = document.getElementById('painel-frota');
    if(painel) painel.classList.toggle('active');
    renderFrota();
}

function toggleGoogleMaps() {
    const painel = document.getElementById('painel-roteiro-escrito');
    if(painel) painel.classList.toggle('active');
    
    setTimeout(() => { 
        if(typeof google !== 'undefined' && map) {
            google.maps.event.trigger(map, 'resize');
        }
    }, 300);
}

// CORREÇÃO: Função adicionada para resolver erro 'toggleCustos is not defined'
function toggleCustos() {
    const sidebar = document.querySelector('.sidebar');
    const painelExtra = document.getElementById('painel-custos-extra');
    
    // Se o painel extra estiver visível, esconde ele e mostra a sidebar padrão
    if (painelExtra.style.display === 'block') {
        painelExtra.style.display = 'none';
        sidebar.style.display = 'block';
    } else {
        // Caso contrário, mostra o painel extra e esconde a sidebar
        painelExtra.style.display = 'block';
        sidebar.style.display = 'none';
        carregarSelectFrota(); // Atualiza o select com a frota salva
    }
}

// CORREÇÃO: Função adicionada para limpar campos do painel extra
function limparPainelCustos() {
    const inputs = ["custoDieselLitro", "consumoDieselMedia", "custoArlaLitro", "arlaPorcentagem", "custoPedagio", "custoManutencaoKm", "consumoFrioHora"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    const sel = document.getElementById('selFrotaVinculo');
    if(sel) sel.value = "";
    atualizarFinanceiro();
}

function toggleAparelhoFrio() {
    const tipo = document.getElementById("tipoCarga").value;
    const div = document.getElementById("container-frio-input");
    const rowAn = document.getElementById("row-an-frio");
    
    // Lógica para exibir inputs de frio
    if(tipo === "frigorifica") {
        if(div) div.style.display = "block";
        if(rowAn) rowAn.style.display = "flex";
    } else {
        if(div) div.style.display = "none";
        if(rowAn) rowAn.style.display = "none";
    }
    atualizarFinanceiro();
}

// --- LÓGICA DO MAPA ---

function initMap() {
    // PROTEÇÃO CONTRA O ERRO DE CONSOLE:
    if (typeof google === 'undefined') {
        console.log("Aguardando Google Maps carregar...");
        setTimeout(initMap, 500);
        return;
    }

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#2563eb', strokeOpacity: 0.8, strokeWeight: 5 }
    });

    const centroBR = { lat: -15.793889, lng: -47.882778 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 4,
        center: centroBR,
        styles: [] 
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
}

function setupAutocomplete() {
    const inputs = ["origem", "destino", "saida"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el && typeof google !== 'undefined') new google.maps.places.Autocomplete(el);
    });
}

function calcularRota() {
    const origem = document.getElementById("origem").value;
    const destino = document.getElementById("destino").value;
    const pontoVazio = document.getElementById("saida").value;

    if(!origem || !destino) {
        alert("Informe pelo menos Origem e Destino.");
        return;
    }

    if(pontoVazio) {
        directionsService.route({
            origin: pontoVazio,
            destination: origem,
            travelMode: 'DRIVING'
        }, (res, status) => {
            if(status === 'OK') distVazioMetros = res.routes[0].legs[0].distance.value;
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
        if(node.value) waypoints.push({ location: node.value, stopover: true });
    });

    directionsService.route({
        origin: origem,
        destination: destino,
        waypoints: waypoints,
        travelMode: 'DRIVING',
        optimizeWaypoints: true
    }, (res, status) => {
        if(status === 'OK') {
            directionsRenderer.setDirections(res);
            distRotaMetros = res.routes[0].legs.reduce((acc, leg) => acc + leg.distance.value, 0);
            rotaIniciada = true;
            processarSegmentosRota(res);
        } else {
            alert("Erro ao traçar rota: " + status);
        }
    });
}

// --- FUNÇÃO PARA PROCESSAR O ROTEIRO (SINTÉTICO / RESUMIDO) ---

function processarSegmentosRota(res) {
    const route = res.routes[0];
    const legs = route.legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    let html = `<div style="padding: 10px; font-family: sans-serif; color: #1e293b;">`;

    legs.forEach((leg) => {
        // Cidade de Partida
        html += `<div style="font-weight: bold; font-size: 15px; margin-bottom: 15px; color: #2563eb;">${leg.start_address.split(',')[0]}</div>`;

        let resumoAgrupado = [];
        let itemAtual = null;

        leg.steps.forEach((step) => {
            const matches = step.instructions.match(/<b>(.*?)<\/b>/g) || [];
            const viaPrincipal = matches[0] ? matches[0].replace(/<[^>]*>?/gm, '') : "Vias locais";

            // Agrupamento Sintético (Igual ao resumo do Google)
            if (itemAtual && (itemAtual.via === viaPrincipal || step.distance.value < 15000)) {
                itemAtual.distancia += step.distance.value;
                itemAtual.duracao += step.duration.value;
            } else {
                if (itemAtual) resumoAgrupado.push(itemAtual);
                itemAtual = {
                    via: viaPrincipal,
                    instrucao: step.instructions.split('<div')[0],
                    distancia: step.distance.value,
                    duracao: step.duration.value
                };
            }
        });
        if (itemAtual) resumoAgrupado.push(itemAtual);

        resumoAgrupado.forEach((bloco) => {
            const km = (bloco.distancia / 1000).toFixed(1).replace('.', ',');
            const h = Math.floor(bloco.duracao / 3600);
            const m = Math.round((bloco.duracao % 3600) / 60);
            const tempoStr = h > 0 ? `${h} h ${m} min` : `${m} min`;

            html += `
                <div style="display: flex; gap: 12px; margin-bottom: 20px; align-items: flex-start;">
                    <div style="color: #94a3b8; font-size: 16px;"></div>
                    <div>
                        <div style="font-size: 13px; line-height: 1.5; color: #1e293b;">${bloco.instrucao}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${tempoStr} (${km} km)</div>
                    </div>
                </div>`;
        });

        // Cidade de Destino
        html += `<div style="font-weight: bold; font-size: 15px; margin-top: 5px; color: #2563eb;">${leg.end_address.split(',')[0]}</div>`;
        html += `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 20px;">${leg.end_address}</div>`;
    });

    html += `</div>`;

    if (listaEscrita) {
        listaEscrita.innerHTML = html;
    }
    
    if (typeof atualizarFinanceiro === "function") {
        atualizarFinanceiro();
    }
}

// --- LÓGICA FINANCEIRA ---

function atualizarFinanceiro() {
    const kmTotal = (distRotaMetros / 1000);
    const kmVazio = (distVazioMetros / 1000);
    const kmGeral = kmTotal + kmVazio;

    const dieselL = parseFloat(document.getElementById("custoDieselLitro").value) || 0;
    const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
    const arlaL = parseFloat(document.getElementById("custoArlaLitro").value) || 0;
    const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
    const pedagio = parseFloat(document.getElementById("custoPedagio").value) || 0;
    const manutKm = parseFloat(document.getElementById("custoManutencaoKm").value) || 0;
    const freteBase = parseFloat(document.getElementById("valorPorKm").value) || 0; // Ajustado para o ID correto do HTML
    const impostoP = parseFloat(document.getElementById("imposto").value) || 1; // Ajustado

    const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
    const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
    const custoManut = kmGeral * manutKm;
    
    let custoFrio = 0;
    if(document.getElementById("tipoCarga").value === "frigorifica") {
        const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        // Simplificação: apenas custo/hora * preço diesel (assumindo diesel para o gerador)
        custoFrio = consH * dieselL * 10; // *10 placeholder de horas
    }

    const totalCustos = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
    // Cálculo simplificado de exemplo
    const lucro = (freteBase * kmTotal * impostoP) - totalCustos;

    const opt = { style: 'currency', currency: 'BRL' };
    
    const ids = {
        "txt-km-total": kmGeral.toFixed(1) + " km",
        "txt-km-vazio-det": kmVazio.toFixed(1) + " km",
        "txt-km-rota-det": kmTotal.toFixed(1) + " km",
        "txt-an-diesel": custoCombustivel.toLocaleString('pt-BR', opt),
        "txt-an-pedagio": pedagio.toLocaleString('pt-BR', opt),
        "txt-an-manut": custoManut.toLocaleString('pt-BR', opt),
        "txt-an-frio": custoFrio.toLocaleString('pt-BR', opt),
        "txt-total-custos": totalCustos.toLocaleString('pt-BR', opt),
        "txt-lucro-real": lucro.toLocaleString('pt-BR', opt)
    };

    for (let id in ids) {
        const el = document.getElementById(id);
        if (el) el.innerText = ids[id];
    }

    const visualVazio = document.getElementById("visual-vazio");
    if(visualVazio && kmGeral > 0) {
        visualVazio.style.width = ((kmVazio / kmGeral) * 100) + "%";
    }
}

// --- GESTÃO DE PARADAS ---

function adicionarParada() {
    const container = document.getElementById("lista-pontos"); // Corrigido para inserir na lista lateral
    if(!container) return;
    
    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `
        <span class="handle">☰</span>
        <input type="text" class="parada-input" placeholder="Parada intermediária..." autocomplete="off">
        <button onclick="this.parentElement.remove(); calcularRota();" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    
    // Insere antes do destino
    const destino = document.getElementById("li-destino");
    container.insertBefore(li, destino);
    
    if(typeof google !== 'undefined') new google.maps.places.Autocomplete(li.querySelector("input"));
}

// --- GESTÃO DE FROTA ---

// Helper para preencher o select do painel extra
function carregarSelectFrota() {
    const sel = document.getElementById('selFrotaVinculo');
    if(!sel) return;
    
    sel.innerHTML = '<option value="">-- Selecione um Veículo --</option>';
    frota.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.text = v.nome;
        sel.appendChild(opt);
    });
}

// Helper para preencher dados ao selecionar no painel extra
function vincularFrota(elem) {
    const id = parseInt(elem.value);
    const v = frota.find(x => x.id === id);
    if(v) {
        if(document.getElementById("custoDieselLitro")) document.getElementById("custoDieselLitro").value = v.diesel || '';
        if(document.getElementById("consumoDieselMedia")) document.getElementById("consumoDieselMedia").value = v.media || '';
        if(document.getElementById("custoManutencaoKm")) document.getElementById("custoManutencaoKm").value = v.manut || '';
        atualizarFinanceiro();
    }
}

function salvarVeiculo() {
    const nome = document.getElementById("f-nome").value;
    
    // Verificação simples
    if(!nome) return;

    const v = {
        id: Date.now(),
        nome,
        // Usando os IDs corretos do seu HTML para captura
        diesel: "", // O form de frota não tem preço diesel, apenas consumo
        media: document.getElementById("f-consumo").value,
        manut: document.getElementById("f-manut").value
    };
    frota.push(v);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
    limparFormFrota();
}

function renderFrota() {
    const list = document.getElementById("lista-v-render");
    if(!list) return;
    list.innerHTML = "";
    frota.forEach(v => {
        const div = document.createElement("div");
        div.className = "veiculo-card";
        div.innerHTML = `
            <div><strong>${v.nome}</strong></div>
            <button onclick="selecionarVeiculo(${v.id})" style="padding:5px 10px; font-size:10px;">Selecionar</button>
            <button onclick="excluirVeiculo(${v.id})" style="padding:5px 10px; font-size:10px; background:red;">×</button>
        `;
        list.appendChild(div);
    });
}

function selecionarVeiculo(id) {
    const v = frota.find(x => x.id === id);
    if(v) {
        // Preenche o painel de custos extra se ele estiver aberto ou prepara os valores
        const m = document.getElementById("consumoDieselMedia");
        const mn = document.getElementById("custoManutencaoKm");
        
        if(m) m.value = v.media;
        if(mn) mn.value = v.manut;
        
        atualizarFinanceiro();
        toggleFrota(); // Fecha o painel da frota
        
        // Opcional: abrir painel de custos
        // toggleCustos(); 
    }
}

function excluirVeiculo(id) {
    frota = frota.filter(x => x.id !== id);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
}

function limparFormFrota() {
    ["f-nome", "f-consumo", "f-manut", "f-arla"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
}

window.onload = initMap;
// Listeners para botões que não usam onclick inline
const btnAdd = document.getElementById("btnAddParada");
if(btnAdd) btnAdd.addEventListener("click", adicionarParada);

const btnCalc = document.getElementById("btnCalcular");
if(btnCalc) btnCalc.addEventListener("click", calcularRota);
