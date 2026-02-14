let map, directionsRenderer, directionsService, paradasData = {}, rotaIniciada = false;
let distVazioMetros = 0, distRotaMetros = 0;
let frota = JSON.parse(localStorage.getItem('frota_db')) || [];

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
        alert("Informe origem e destino.");
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
            
            // Chama o processamento do roteiro sintetizado
            processarSegmentosRota(res);
        } else {
            alert("Erro ao traçar rota: " + status);
        }
    });
}

// --- FUNÇÃO DE ROTEIRO RESUMIDO (SOLUÇÃO FINAL PARA O PAINEL) ---

function processarSegmentosRota(res) {
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    if (!listaEscrita) {
        console.error("ERRO: Elemento 'lista-passo-a-passo' não encontrado no HTML.");
        return;
    }

    // LIMPEZA TOTAL E ABSOLUTA DO PAINEL
    listaEscrita.innerHTML = ""; 

    const legs = res.routes[0].legs;
    let htmlContent = `<div style="padding: 10px; color: #1e293b;">`;

    legs.forEach((leg) => {
        // ORIGEM
        htmlContent += `
            <div style="margin-bottom: 20px;">
                <div style="font-weight: 800; font-size: 15px; color: #2563eb; text-transform: uppercase;">${leg.start_address.split(',')[0]}</div>
                <div style="font-size: 11px; color: #94a3b8;">${leg.start_address}</div>
            </div>
        `;

        let grupos = [];
        let atual = null;

        leg.steps.forEach((step) => {
            const match = step.instructions.match(/<b>(.*?)<\/b>/g) || [];
            const via = match[0] ? match[0].replace(/<[^>]*>?/gm, '') : "Vias locais";

            // Agrupamento sintético (se for a mesma via ou trecho < 30km)
            if (atual && (atual.via === via || step.distance.value < 30000)) {
                atual.dist += step.distance.value;
                atual.tempo += step.duration.value;
                match.forEach(m => {
                    let v = m.replace(/<[^>]*>?/gm, '');
                    if(!atual.vias.includes(v)) atual.vias.push(v);
                });
            } else {
                if (atual) grupos.push(atual);
                atual = {
                    via: via,
                    vias: match.map(m => m.replace(/<[^>]*>?/gm, '')),
                    dist: step.distance.value,
                    tempo: step.duration.value,
                    texto: step.instructions.split('<div')[0]
                };
            }
        });
        if (atual) grupos.push(atual);

        grupos.forEach((g) => {
            const km = (g.dist / 1000).toFixed(1);
            const h = Math.floor(g.tempo / 3600);
            const m = Math.round((g.tempo % 3600) / 60);
            const tStr = h > 0 ? `${h} h ${m} min` : `${m} min`;

            let displayTxt = g.texto;
            if(g.vias.length > 1) {
                displayTxt = `Siga pela <b>${g.via}</b> via ${g.vias.slice(1,3).join(', ')}`;
            }

            htmlContent += `
                <div style="display: flex; gap: 15px; margin-bottom: 22px; align-items: flex-start; border-left: 2px solid #e2e8f0; padding-left: 15px; margin-left: 5px;">
                    <div style="color: #cbd5e1; font-size: 18px;"></div>
                    <div style="flex: 1;">
                        <div style="font-size: 13.5px; line-height: 1.4;">${displayTxt}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: bold;">${tStr} (${km} km)</div>
                    </div>
                </div>
            `;
        });

        // DESTINO
        htmlContent += `
            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #f1f5f9;">
                <div style="font-weight: 800; font-size: 15px; color: #2563eb; text-transform: uppercase;">${leg.end_address.split(',')[0]}</div>
                <div style="font-size: 11px; color: #94a3b8;">${leg.end_address}</div>
            </div>
        `;
    });

    htmlContent += `</div>`;
    
    // INJEÇÃO FINAL
    listaEscrita.innerHTML = htmlContent;

    if (typeof atualizarFinanceiro === "function") atualizarFinanceiro();
}

// --- RESTO DO CÓDIGO (FINANCEIRO E FROTA) MANTIDOS ---

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
