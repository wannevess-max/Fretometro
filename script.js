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

/**
 * IMPLEMENTAÇÃO SOLICITADA:
 * Gerencia a visibilidade do painel de custos ocupando 25% da tela.
 * Adiciona a classe 'custos-visible' ao body para que o CSS possa redimensionar o layout.
 */
function toggleCustos() {
    const body = document.body;
    const painelExtra = document.getElementById('painel-custos-extra');
    const sidebarPadrao = document.querySelector('.sidebar');
    
    if (!painelExtra) return;

    // Toggle da classe de controle de layout no Body
    body.classList.toggle('custos-open');

    if (body.classList.contains('custos-open')) {
        // MOSTRAR PAINEL
        painelExtra.style.display = 'block';
        if (sidebarPadrao) sidebarPadrao.style.display = 'none';
        carregarSelectFrota();
    } else {
        // ESCONDER PAINEL
        painelExtra.style.display = 'none';
        if (sidebarPadrao) sidebarPadrao.style.display = 'block';
    }

    // Redimensiona o mapa para ajustar ao novo espaço de 75%
    setTimeout(() => {
        if (typeof google !== 'undefined' && map) {
            google.maps.event.trigger(map, 'resize');
        }
    }, 300);
}

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
    const containerDatas = document.getElementById("container-frio-datas");
    
    if(tipo === "frigorifica") {
        if(div) div.style.display = "block";
        if(rowAn) rowAn.style.display = "flex";
        if(containerDatas) containerDatas.style.display = "block";
    } else {
        if(div) div.style.display = "none";
        if(rowAn) rowAn.style.display = "none";
        if(containerDatas) containerDatas.style.display = "none";
    }
    atualizarFinanceiro();
}

// --- LÓGICA DO MAPA ---

function initMap() {
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
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
        if(el && typeof google !== 'undefined' && google.maps.places) {
            new google.maps.places.Autocomplete(el);
        }
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
            if(status === 'OK') {
                distVazioMetros = res.routes[0].legs[0].distance.value;
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

function processarSegmentosRota(res) {
    const route = res.routes[0];
    const legs = route.legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    let html = `<div style="padding: 10px; font-family: sans-serif; color: #1e293b;">`;

    legs.forEach((leg) => {
        html += `<div style="font-weight: bold; font-size: 15px; margin-bottom: 15px; color: #2563eb;">${leg.start_address.split(',')[0]}</div>`;
        let resumoAgrupado = [];
        let itemAtual = null;

        leg.steps.forEach((step) => {
            const matches = step.instructions.match(/<b>(.*?)<\/b>/g) || [];
            const viaPrincipal = matches[0] ? matches[0].replace(/<[^>]*>?/gm, '') : "Vias locais";

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
                    <div style="color: #94a3b8; font-size: 16px;">➤</div>
                    <div>
                        <div style="font-size: 13px; line-height: 1.5; color: #1e293b;">${bloco.instrucao}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${tempoStr} (${km} km)</div>
                    </div>
                </div>`;
        });
        html += `<div style="font-weight: bold; font-size: 15px; margin-top: 5px; color: #2563eb;">${leg.end_address.split(',')[0]}</div>`;
        html += `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 20px;">${leg.end_address}</div>`;
    });

    html += `</div>`;
    if (listaEscrita) listaEscrita.innerHTML = html;
    atualizarFinanceiro();
}

// --- LÓGICA FINANCEIRA ---

function atualizarFinanceiro() {
    const kmTotal = (distRotaMetros / 1000);
    const kmVazio = (distVazioMetros / 1000);
    const kmGeral = kmTotal + kmVazio;

    const dieselL = parseFloat(document.getElementById("custoDieselLitro").value.replace("R$ ","").replace(",",".")) || 0;
    const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
    const arlaL = parseFloat(document.getElementById("custoArlaLitro").value.replace("R$ ","").replace(",",".")) || 0;
    const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
    const pedagio = parseFloat(document.getElementById("custoPedagio").value.replace("R$ ","").replace(",",".")) || 0;
    const manutKm = parseFloat(document.getElementById("custoManutencaoKm").value.replace("R$ ","").replace(",",".")) || 0;
    const freteBase = parseFloat(document.getElementById("valorPorKm").value.replace("R$ ","").replace(",",".")) || 0;
    const impostoP = parseFloat(document.getElementById("imposto").value) || 1;

    const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
    const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
    const custoManut = kmGeral * manutKm;
    
    let custoFrio = 0;
    if(document.getElementById("tipoCarga").value === "frigorifica") {
        const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        custoFrio = consH * dieselL * 5; // Exemplo de 5 horas de uso
    }

    const totalCustos = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
    const freteLiq = (freteBase * kmTotal) * impostoP;
    const lucro = freteLiq - totalCustos;

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
}

// --- GESTÃO DE PARADAS ---

function adicionarParada() {
    const container = document.getElementById("lista-pontos");
    if(!container) return;
    
    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `
        <span class="handle">☰</span>
        <input type="text" class="parada-input" placeholder="Parada intermediária..." autocomplete="off">
        <button onclick="this.parentElement.remove(); calcularRota();" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    
    const destino = document.getElementById("li-destino");
    container.insertBefore(li, destino);
    
    if(typeof google !== 'undefined' && google.maps.places) {
        new google.maps.places.Autocomplete(li.querySelector("input"));
    }
}

// --- GESTÃO DE FROTA ---

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

function vincularFrota(elem) {
    const id = parseInt(elem.value);
    const v = frota.find(x => x.id === id);
    if(v) {
        if(document.getElementById("consumoDieselMedia")) document.getElementById("consumoDieselMedia").value = v.media || '';
        if(document.getElementById("custoManutencaoKm")) document.getElementById("custoManutencaoKm").value = v.manut || '';
        atualizarFinanceiro();
    }
}

function salvarVeiculo() {
    const nome = document.getElementById("f-nome").value;
    if(!nome) return;

    const v = {
        id: Date.now(),
        nome,
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
        const m = document.getElementById("consumoDieselMedia");
        const mn = document.getElementById("custoManutencaoKm");
        if(m) m.value = v.media;
        if(mn) mn.value = v.manut;
        atualizarFinanceiro();
        toggleFrota();
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

function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, "");
    valor = (valor / 100).toFixed(2).replace(".", ",");
    input.value = "R$ " + valor;
}

// Inicialização
window.initMap = initMap;
