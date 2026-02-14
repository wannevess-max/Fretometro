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
        if(typeof google !== 'undefined') {
            google.maps.event.trigger(map, 'resize');
        }
    }, 300);
}

function toggleAparelhoFrio() {
    const tipo = document.getElementById("tipoCarga").value;
    const div = document.getElementById("div-aparelho-frio");
    const rowAn = document.getElementById("row-an-frio");
    if(tipo === "frigorificada") {
        div.style.display = "block";
        rowAn.style.display = "flex";
    } else {
        div.style.display = "none";
        rowAn.style.display = "none";
    }
    atualizarFinanceiro();
}

// --- LÓGICA DO MAPA ---

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
        styles: [] 
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
}

function setupAutocomplete() {
    const inputs = ["origem", "destino", "pontoVazio"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) new google.maps.places.Autocomplete(el);
    });
}

function calcularRota() {
    const origem = document.getElementById("origem").value;
    const destino = document.getElementById("destino").value;
    const pontoVazio = document.getElementById("pontoVazio").value;

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
    
    let html = `<div style="padding: 10px; font-family: sans-serif; color: #333;">`;

    legs.forEach((leg) => {
        // Cidade de Partida
        html += `<div style="font-weight: bold; font-size: 15px; margin-bottom: 15px;">${leg.start_address.split(',')[0]}</div>`;

        let resumoAgrupado = [];
        let itemAtual = null;

        leg.steps.forEach((step) => {
            const matches = step.instructions.match(/<b>(.*?)<\/b>/g) || [];
            const viaPrincipal = matches[0] ? matches[0].replace(/<[^>]*>?/gm, '') : "Vias locais";

            // Agrupamento Sintético: une trechos da mesma via ou manobras muito curtas
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
                <div style="display: flex; gap: 10px; margin-bottom: 20px; align-items: flex-start;">
                    <div style="color: #666; font-size: 16px;"></div>
                    <div>
                        <div style="font-size: 13px; line-height: 1.4;">${bloco.instrucao}</div>
                        <div style="font-size: 12px; color: #777; margin-top: 2px;">${tempoStr} (${km} km)</div>
                    </div>
                </div>`;
        });

        // Cidade de Destino
        html += `<div style="font-weight: bold; font-size: 15px; margin-top: 5px;">${leg.end_address.split(',')[0]}</div>`;
        html += `<div style="font-size: 11px; color: #999; margin-bottom: 20px;">${leg.end_address}</div>`;
    });

    html += `</div>`;

    // Aplicação segura conforme solicitado
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
    const freteBase = parseFloat(document.getElementById("valorFrete").value) || 0;
    const impostoP = (parseFloat(document.getElementById("porcentagemImposto").value) || 0) / 100;

    const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
    const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
    const custoManut = kmGeral * manutKm;
    
    let custoFrio = 0;
    if(document.getElementById("tipoCarga").value === "frigorificada") {
        const horas = parseFloat(document.getElementById("horasFrio").value) || 0;
        const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        custoFrio = horas * consH * dieselL;
    }

    const totalCustos = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
    const impostoValor = freteBase * impostoP;
    const lucro = freteBase - totalCustos - impostoValor;

    const opt = { style: 'currency', currency: 'BRL' };
    
    // Atualização dos IDs existentes no HTML
    const ids = {
        "txt-km-total": kmTotal.toFixed(1) + " km",
        "txt-km-vazio": kmVazio.toFixed(1) + " km",
        "txt-custo-diesel": custoCombustivel.toLocaleString('pt-BR', opt),
        "txt-an-pedagio": pedagio.toLocaleString('pt-BR', opt),
        "txt-an-manut": custoManut.toLocaleString('pt-BR', opt),
        "txt-an-frio": custoFrio.toLocaleString('pt-BR', opt),
        "txt-total-custos": totalCustos.toLocaleString('pt-BR', opt),
        "txt-an-frete-liquido": freteBase.toLocaleString('pt-BR', opt),
        "txt-an-imposto": impostoValor.toLocaleString('pt-BR', opt),
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
    const container = document.getElementById("container-paradas");
    if(!container) return;
    const div = document.createElement("div");
    div.className = "parada-item";
    div.innerHTML = `
        <input type="text" class="parada-input" placeholder="Cidade de parada...">
        <button onclick="this.parentElement.remove(); calcularRota();">×</button>
    `;
    container.appendChild(div);
    new google.maps.places.Autocomplete(div.querySelector("input"));
}

// --- GESTÃO DE FROTA ---

function salvarVeiculo() {
    const nome = document.getElementById("f-nome").value;
    const placa = document.getElementById("f-placa").value;
    if(!nome || !placa) return;

    const v = {
        id: Date.now(),
        nome, placa,
        diesel: document.getElementById("f-diesel").value,
        media: document.getElementById("f-media").value,
        manut: document.getElementById("f-manut").value
    };
    frota.push(v);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
    limparFormFrota();
}

function renderFrota() {
    const list = document.getElementById("lista-frota");
    if(!list) return;
    list.innerHTML = "";
    frota.forEach(v => {
        const div = document.createElement("div");
        div.className = "veiculo-card";
        div.innerHTML = `
            <div><strong>${v.nome}</strong><br><small>${v.placa}</small></div>
            <button onclick="selecionarVeiculo(${v.id})" style="padding:5px 10px; font-size:10px;">Selecionar</button>
            <button onclick="excluirVeiculo(${v.id})" style="padding:5px 10px; font-size:10px; background:red;">×</button>
        `;
        list.appendChild(div);
    });
}

function selecionarVeiculo(id) {
    const v = frota.find(x => x.id === id);
    if(v) {
        const d = document.getElementById("custoDieselLitro");
        const m = document.getElementById("consumoDieselMedia");
        const mn = document.getElementById("custoManutencaoKm");
        if(d) d.value = v.diesel;
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
    ["f-nome", "f-placa", "f-diesel", "f-media", "f-manut"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
}

window.onload = initMap;
