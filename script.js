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
    
    if (!listaEscrita) return;

    // FORÇAR LIMPEZA DA MENSAGEM "Calcule uma rota..."
    listaEscrita.innerHTML = "";

    let html = `<div style="padding: 15px; color: #1e293b; font-family: Arial, sans-serif;">`;

    legs.forEach((leg) => {
        // Cidade de Início
        html += `<div style="font-weight: bold; font-size: 16px; margin-bottom: 20px; color: #1a73e8;">${leg.start_address.split(',')[0]}</div>`;

        let resumoAgrupado = [];
        let itemAtual = null;

        leg.steps.forEach((step) => {
            // Extrai as vias principais (tags <b>)
            const matches = step.instructions.match(/<b>(.*?)<\/b>/g) || [];
            const viaPrincipal = matches[0] ? matches[0].replace(/<[^>]*>?/gm, '') : "Vias locais";

            // LÓGICA DE AGRUPAMENTO SINTÉTICO (Igual ao que o Google faz no painel lateral)
            // Agrupamos se for a mesma via principal OU se o trecho for menor que 20km (manobras curtas)
            if (itemAtual && (itemAtual.via === viaPrincipal || step.distance.value < 20000)) {
                itemAtual.distancia += step.distance.value;
                itemAtual.duracao += step.duration.value;
                // Acumula as referências de via (ex: "via Rod. X, Rod Y")
                matches.forEach(m => {
                    let v = m.replace(/<[^>]*>?/gm, '');
                    if(!itemAtual.viasMencionadas.includes(v)) itemAtual.viasMencionadas.push(v);
                });
            } else {
                if (itemAtual) resumoAgrupado.push(itemAtual);
                itemAtual = {
                    via: viaPrincipal,
                    viasMencionadas: [...new Set(matches.map(m => m.replace(/<[^>]*>?/gm, '')))],
                    distancia: step.distance.value,
                    duracao: step.duration.value,
                    instrucaoLimpa: step.instructions.split('<div')[0]
                };
            }
        });
        if (itemAtual) resumoAgrupado.push(itemAtual);

        // Gerar o HTML dos blocos sintéticos
        resumoAgrupado.forEach((bloco) => {
            const km = (bloco.distancia / 1000).toFixed(1).replace('.', ',');
            const horas = Math.floor(bloco.duracao / 3600);
            const minutos = Math.round((bloco.duracao % 3600) / 60);
            const tempoStr = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;

            // Montagem do texto: "Pegue a [Via Principal] via [Outras Vias]"
            let textoExibicao = bloco.instrucaoLimpa;
            if (bloco.viasMencionadas.length > 1) {
                const extras = bloco.viasMencionadas.slice(1, 4).join(', ');
                textoExibicao = `Siga pela <b>${bloco.via}</b> via ${extras}`;
            }

            html += `
                <div style="display: flex; gap: 15px; margin-bottom: 25px; align-items: flex-start;">
                    <div style="color: #5f6368; font-size: 18px; padding-top: 2px;"></div>
                    <div style="flex: 1;">
                        <div style="font-size: 14px; color: #202124; line-height: 1.4;">${textoExibicao}</div>
                        <div style="font-size: 13px; color: #70757a; margin-top: 4px;">${tempoStr} (${km} km)</div>
                    </div>
                </div>`;
        });

        // Cidade de Destino
        html += `<div style="font-weight: bold; font-size: 16px; margin-top: 10px; color: #1a73e8;">${leg.end_address.split(',')[0]}</div>`;
        html += `<div style="font-size: 12px; color: #70757a; margin-bottom: 30px;">${leg.end_address.split(',').slice(1).join(',')}</div>`;
    });

    html += `</div>`;
    
    // INJETAR O CONTEÚDO NO PAINEL
    listaEscrita.innerHTML = html;

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
