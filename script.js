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

    // 1. Rota de Deslocamento (Vazio)
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

// --- FUNÇÃO PARA PROCESSAR O ROTEIRO (LIMPA PARA RECOMEÇAR DO ZERO) ---

function processarSegmentosRota(res) {
    const route = res.routes[0];
    const legs = route.legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    // Conteúdo limpo para iniciarmos a nova lógica de agrupamento
    listaEscrita.innerHTML = "";

    // Chama o financeiro para atualizar os custos baseados na nova distância
    if (typeof atualizarFinanceiro === "function") atualizarFinanceiro();
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

    // Atualização do Painel Lateral
    const opt = { style: 'currency', currency: 'BRL' };
    document.getElementById("txt-km-total").innerText = kmTotal.toFixed(1) + " km";
    document.getElementById("txt-km-vazio").innerText = kmVazio.toFixed(1) + " km";
    document.getElementById("txt-custo-diesel").innerText = custoCombustivel.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-pedagio").innerText = pedagio.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-manut").innerText = custoManut.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-frio").innerText = custoFrio.toLocaleString('pt-BR', opt);
    document.getElementById("txt-total-custos").innerText = totalCustos.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-frete-liquido").innerText = freteBase.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-imposto").innerText = impostoValor.toLocaleString('pt-BR', opt);
    document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);

    // Ajuste visual da barra de vazio/rota
    const pVazio = kmGeral > 0 ? (kmVazio / kmGeral) * 100 : 0;
    if(document.getElementById("visual-vazio")) document.getElementById("visual-vazio").style.width = pVazio + "%";
}

// --- GESTÃO DE PARADAS (WAYPOINTS) ---

function adicionarParada() {
    const container = document.getElementById("container-paradas");
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
    list.innerHTML = "";
    frota.forEach(v => {
        const div = document.createElement("div");
        div.className = "veiculo-card";
        div.innerHTML = `
            <div>
                <strong>${v.nome}</strong><br><small>${v.placa}</small>
            </div>
            <button onclick="selecionarVeiculo(${v.id})" style="padding:5px 10px; font-size:10px;">Selecionar</button>
            <button onclick="excluirVeiculo(${v.id})" style="padding:5px 10px; font-size:10px; background:red;">×</button>
        `;
        list.appendChild(div);
    });
}

function selecionarVeiculo(id) {
    const v = frota.find(x => x.id === id);
    if(v) {
        document.getElementById("custoDieselLitro").value = v.diesel;
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

function limparFormFrota() {
    ["f-nome", "f-placa", "f-diesel", "f-media", "f-manut"].forEach(id => document.getElementById(id).value = "");
}

window.onload = initMap;
