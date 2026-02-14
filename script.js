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

function toggleCustos() {
    const sidebar = document.querySelector('.sidebar');
    const painelExtra = document.getElementById('painel-custos-extra');
    
    if (painelExtra.style.display === 'block') {
        painelExtra.style.display = 'none';
        sidebar.style.display = 'block';
    } else {
        painelExtra.style.display = 'block';
        sidebar.style.display = 'none';
        carregarSelectFrota(); 
    }
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
    if (typeof google === 'undefined') {
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

// --- FUNÇÃO PARA PROCESSAR O ROTEIRO (SINTÉTICO COM TABELA DE 3 COLUNAS) ---

function processarSegmentosRota(res) {
    const route = res.routes[0];
    const legs = route.legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    let html = `
    <div style="padding: 10px; font-family: sans-serif; color: #1e293b;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <thead>
                <tr style="background-color: #f8fafc; text-align: left;">
                    <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0; width: 30px;">Seq</th>
                    <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0;">Estrada / Cidade</th>
                    <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0;">Referência (Via)</th>
                    <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0; text-align: right;">Dist.</th>
                </tr>
            </thead>
            <tbody>`;

    let seqGlobal = 1;

    legs.forEach((leg) => {
        let resumoAgrupado = [];
        let itemAtual = null;

        leg.steps.forEach((step) => {
            const matches = step.instructions.match(/<b>(.*?)<\/b>/g) || [];
            const viaPrincipal = matches[0] ? matches[0].replace(/<[^>]*>?/gm, '') : "Vias locais";
            
            // Tenta obter a cidade/estado do final do endereço do trecho
            const partesEnd = leg.end_address.split(',');
            const cidadeEstado = partesEnd.length >= 2 ? `${partesEnd[partesEnd.length-3].trim()} / ${partesEnd[partesEnd.length-2].trim().split(' ')[0]}` : "Trecho em rota";

            if (itemAtual && (itemAtual.via === viaPrincipal || step.distance.value < 15000)) {
                itemAtual.distancia += step.distance.value;
            } else {
                if (itemAtual) resumoAgrupado.push(itemAtual);
                itemAtual = {
                    via: viaPrincipal,
                    cidade: cidadeEstado,
                    instrucao: step.instructions.split('<div')[0].replace(/<[^>]*>?/gm, ''),
                    distancia: step.distance.value
                };
            }
        });
        if (itemAtual) resumoAgrupado.push(itemAtual);

        resumoAgrupado.forEach((bloco) => {
            const km = (bloco.distancia / 1000).toFixed(1).replace('.', ',');
            
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 8px; color: #94a3b8; font-weight: bold;">${seqGlobal++}</td>
                    <td style="padding: 10px 8px;">
                        <div style="font-weight: 600; color: #1e293b;">${bloco.cidade}</div>
                        <div style="font-size: 10px; color: #64748b; line-height: 1.2;">${bloco.instrucao.substring(0, 50)}...</div>
                    </td>
                    <td style="padding: 10px 8px; color: #2563eb; font-weight: 500; font-family: monospace;">${bloco.via}</td>
                    <td style="padding: 10px 8px; text-align: right; color: #64748b; white-space: nowrap;">${km} km</td>
                </tr>`;
        });
    });

    html += `</tbody></table></div>`;

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

    const dieselL = parseFloat(document.getElementById("custoDieselLitro").value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
    const arlaL = parseFloat(document.getElementById("custoArlaLitro").value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
    const pedagio = parseFloat(document.getElementById("custoPedagio").value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    const manutKm = parseFloat(document.getElementById("custoManutencaoKm").value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    const freteBase = parseFloat(document.getElementById("valorPorKm").value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    const impostoP = parseFloat(document.getElementById("imposto").value) || 1;

    const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
    const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
    const custoManut = kmGeral * manutKm;
    
    let custoFrio = 0;
    if(document.getElementById("tipoCarga").value === "frigorifica") {
        const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        custoFrio = consH * dieselL * 10; 
    }

    const totalCustos = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
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
    
    if(typeof google !== 'undefined') new google.maps.places.Autocomplete(li.querySelector("input"));
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

window.onload = initMap;

const btnAdd = document.getElementById("btnAddParada");
if(btnAdd) btnAdd.addEventListener("click", adicionarParada);

const btnCalc = document.getElementById("btnCalcular");
if(btnCalc) btnCalc.addEventListener("click", calcularRota);
