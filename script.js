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
    painel.classList.toggle('active');
    renderFrota();
}

function toggleGoogleMaps() {
    const painel = document.getElementById('painel-roteiro-escrito');
    painel.classList.toggle('active');
    
    setTimeout(() => { 
        google.maps.event.trigger(map, "resize"); 
        if (directionsRenderer.getDirections()) {
            const res = directionsRenderer.getDirections();
            map.fitBounds(res.routes[0].bounds);
        }
    }, 400);
}

// --- GESTÃO DE FROTA (MANTIDO INTEGRAL) ---

function salvarVeiculo() {
    const idx = parseInt(document.getElementById('f-edit-index').value);
    const v = {
        nome: document.getElementById('f-nome').value,
        eixos: document.getElementById('f-eixos').value,
        consumo: document.getElementById('f-consumo').value,
        manut: document.getElementById('f-manut').value,
        arla: document.getElementById('f-arla').value,
        temFrio: document.getElementById('f-tem-frio').checked,
        consumoFrio: document.getElementById('f-consumo-frio').value
    };
    if(!v.nome) return alert("Apelido/Modelo obrigatório");
    if(idx === -1) frota.push(v); else frota[idx] = v;
    localStorage.setItem('frota_db', JSON.stringify(frota));
    
    document.getElementById('f-nome').value = ''; 
    document.getElementById('f-consumo').value = '';
    document.getElementById('f-manut').value = '';
    document.getElementById('f-arla').value = '';
    document.getElementById('f-tem-frio').checked = false;
    document.getElementById('f-box-frio').style.display = 'none';
    document.getElementById('f-edit-index').value = '-1';
    document.getElementById('frota-titulo').innerText = "Minha Frota";
    
    renderFrota();
    updateSelects();
}

function renderFrota() {
    const container = document.getElementById('lista-v-render');
    container.innerHTML = frota.map((v, i) => `
        <div class="veiculo-card">
            <div><b>${v.nome}</b><br><small>${v.eixos} Eixos | ${v.consumo} Km/L</small></div>
            <div>
                <button onclick="editV(${i})" style="border:none; background:none; cursor:pointer;">✏️</button>
                <button onclick="delV(${i})" style="border:none; background:none; cursor:pointer; color:red;">🗑️</button>
            </div>
        </div>
    `).join('');
}

function editV(i) {
    const v = frota[i];
    document.getElementById('f-nome').value = v.nome;
    document.getElementById('f-eixos').value = v.eixos;
    document.getElementById('f-consumo').value = v.consumo;
    document.getElementById('f-manut').value = v.manut;
    document.getElementById('f-arla').value = v.arla || '';
    document.getElementById('f-tem-frio').checked = v.temFrio || false;
    document.getElementById('f-box-frio').style.display = v.temFrio ? 'block' : 'none';
    document.getElementById('f-consumo-frio').value = v.consumoFrio || '';
    document.getElementById('f-edit-index').value = i;
    document.getElementById('frota-titulo').innerText = "Editar Veículo";
}

function delV(i) {
    frota.splice(i, 1);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
    updateSelects();
}

function updateSelects() {
    const sel = document.getElementById('selFrotaVinculo');
    if(!sel) return;
    let html = '<option value="">Selecione...</option>';
    html += '<option value="manual">Inserir Manualmente</option>';
    frota.forEach((v, i) => { html += `<option value="${i}">${v.nome}</option>`; });
    sel.innerHTML = html;
}

function vincularFrota(sel) {
    const inputsCustos = ["consumoDieselMedia", "custoManutencaoKm", "consumoFrioHora", "arlaPorcentagem"];
    if(sel.value === "manual" || sel.value === "") {
        inputsCustos.forEach(id => { 
            const el = document.getElementById(id); 
            if(el) { el.readOnly = false; el.style.opacity = "1"; } 
        });
        return;
    }
    const v = frota[sel.value];
    document.getElementById('consumoDieselMedia').value = v.consumo;
    document.getElementById('custoManutencaoKm').value = v.manut;
    document.getElementById('arlaPorcentagem').value = v.arla;
    document.getElementById('consumoFrioHora').value = v.consumoFrio || "";
    
    inputsCustos.forEach(id => { 
        const el = document.getElementById(id); 
        if(el) { el.readOnly = true; el.style.opacity = "0.8"; } 
    });
    atualizarFinanceiro();
}

// --- AUXILIARES E CUSTOS ---

function toggleAparelhoFrio() {
    const isFrigo = document.getElementById("tipoCarga").value === "frigorifica";
    document.getElementById("container-frio-input").style.display = isFrigo ? "block" : "none";
    document.getElementById("container-frio-datas").style.display = isFrigo ? "block" : "none";
    atualizarFinanceiro();
}

function toggleCustos() {
    const painel = document.getElementById('painel-custos-extra');
    const isHidden = window.getComputedStyle(painel).display === 'none';
    const novoEstado = isHidden ? 'block' : 'none';
    painel.style.display = novoEstado;
    localStorage.setItem('painelCustosEstado', novoEstado);
    if (map) {
        setTimeout(() => { google.maps.event.trigger(map, "resize"); }, 300);
    }
}

function formatarMoeda(input) {
    let value = input.value.replace(/\D/g, "");
    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    input.value = "R$ " + value;
    atualizarFinanceiro();
}

function converterParaFloat(stringMoeda) {
    if (!stringMoeda || typeof stringMoeda !== 'string') return 0;
    return parseFloat(stringMoeda.replace("R$ ", "").replace(/\./g, "").replace(",", ".")) || 0;
}

// --- CORE DO APLICATIVO (MAPS) ---

function initApp() {
    map = new google.maps.Map(document.getElementById("map"), { 
        center: { lat: -14.235, lng: -51.925 }, 
        zoom: 4, 
        mapTypeControl: false,
        streetViewControl: false
    });
    directionsRenderer = new google.maps.DirectionsRenderer({ draggable: true, map: map });
    directionsService = new google.maps.DirectionsService();
    
    Sortable.create(document.getElementById('lista-pontos'), { 
        animation: 150, handle: '.handle', draggable: '.sortable-item', 
        onEnd: () => { if(rotaIniciada) calcularRota(); } 
    });

    setupAutocomplete("saida"); setupAutocomplete("origem"); setupAutocomplete("destino");

    document.getElementById("themeBtn").onclick = function() {
        document.body.classList.toggle("dark-mode");
        map.setOptions({ styles: document.body.classList.contains("dark-mode") ? darkStyle : [] });
    };

    document.getElementById("tipoDeslocamento").onchange = function() {
        document.getElementById("valorDeslocamentoKm").style.display = (this.value === "remunerado_km") ? "block" : "none";
        document.getElementById("valorDeslocamentoTotal").style.display = (this.value === "remunerado_rs") ? "block" : "none";
        atualizarFinanceiro();
    };

    const inputMoedas = ["valorPorKm", "valorDeslocamentoKm", "valorDeslocamentoTotal", "custoDieselLitro", "custoPedagio", "custoManutencaoKm", "custoArlaLitro"];
    inputMoedas.forEach(id => {
        const el = document.getElementById(id); 
        if(el) el.oninput = () => { formatarMoeda(el); atualizarFinanceiro(); };
    });

    ["consumoDieselMedia", "arlaPorcentagem", "consumoFrioHora", "prevColeta", "prevEntrega"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.oninput = atualizarFinanceiro;
    });

    document.getElementById("imposto").onchange = atualizarFinanceiro;
    document.getElementById("btnAddParada").onclick = adicionarCampoParada;
    document.getElementById("btnCalcular").onclick = calcularRota;
    
    directionsRenderer.addListener('directions_changed', () => { 
        const res = directionsRenderer.getDirections(); if (res) processarSegmentosRota(res); 
    });

    updateSelects();
    const estadoSalvo = localStorage.getItem('painelCustosEstado');
    if (estadoSalvo) document.getElementById('painel-custos-extra').style.display = estadoSalvo;
}

function setupAutocomplete(id) {
    const input = document.getElementById(id);
    if(!input) return;
    const auto = new google.maps.places.Autocomplete(input, { componentRestrictions: { country: "br" }, fields: ["place_id", "geometry", "formatted_address"] });
    auto.addListener("place_changed", () => { 
        const place = auto.getPlace(); 
        if (!place.place_id) return;
        paradasData[id] = place.place_id; 
        if (id === "saida") document.getElementById("container-config-deslocamento").style.display = "flex";
        if(rotaIniciada) calcularRota(); 
    });
}

function adicionarCampoParada() {
    const id = `parada_${Date.now()}`;
    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `
        <span class="handle">☰</span>
        <input id="${id}" type="text" placeholder="Parada" autocomplete="off">
        <button class="btn-remove" onclick="this.parentElement.remove(); calcularRota();">✕</button>
    `;
    document.getElementById("lista-pontos").insertBefore(li, document.getElementById("li-destino"));
    setupAutocomplete(id);
    setTimeout(() => { document.getElementById(id).focus(); }, 100);
}

function calcularRota() {
    const inputs = Array.from(document.querySelectorAll("#lista-pontos li input[type='text']"));
    const ids = inputs.map(i => paradasData[i.id]).filter(id => id);
    if (ids.length < 2) return;
    const request = { 
        origin: { placeId: ids[0] }, 
        destination: { placeId: ids[ids.length - 1] }, 
        waypoints: ids.slice(1, -1).map(id => ({ location: { placeId: id }, stopover: true })), 
        travelMode: google.maps.TravelMode.DRIVING 
    };
    directionsService.route(request, (res, status) => { 
        if (status === "OK") { 
            directionsRenderer.setDirections(res); 
            rotaIniciada = true; 
            processarSegmentosRota(res); 
        } 
    });
}

// --- LOGICA DE TABELA DE 5 COLUNAS CORRIGIDA ---

{
    const legs = res.routes[0].legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    const temSaida = document.getElementById("saida").value;

    // Mantém as variáveis globais de distância para não quebrar seus cálculos financeiros
    if (temSaida && legs.length >= 2) {
        distVazioMetros = legs[0].distance.value;
        distRotaMetros = legs.slice(1).reduce((acc, leg) => acc + leg.distance.value, 0);
    } else {
        distVazioMetros = 0;
        distRotaMetros = legs.reduce((acc, leg) => acc + leg.distance.value, 0);
    }

    let html = `
        <table class="tabela-roteiro" style="width:100%; border-collapse: collapse; min-width: 800px;">
            <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="width: 45px; padding: 10px; text-align: left;">Seq</th>
                    <th style="width: 180px; padding: 10px; text-align: left;">Estrada / Cidade</th>
                    <th style="width: 140px; padding: 10px; text-align: left;">Referência (Via)</th>
                    <th style="padding: 10px; text-align: left;">Nome do Trecho</th>
                    <th style="width: 85px; padding: 10px; text-align: right;">KM</th>
                </tr>
            </thead>
            <tbody>`;

    let globalSeq = 1;
    let estadoAnterior = "";

    legs.forEach((leg, legIndex) => {
        const isVazio = (temSaida && legIndex === 0);
        
        // --- LÓGICA DE EXTRAÇÃO DE CIDADE ---
        const partesEnd = leg.start_address.split(',');
        let cidadeUF = "Rota";
        let ufAtual = "";
        if (partesEnd.length >= 3) {
            const trechoLocal = partesEnd[partesEnd.length - 3].trim();
            cidadeUF = trechoLocal;
            const ufMatch = trechoLocal.match(/\b([A-Z]{2})\b/);
            ufAtual = ufMatch ? ufMatch[1] : "";
        }

        leg.steps.forEach((step) => {
            const instrucaoHTML = step.instructions;
            const instrucaoLimpa = instrucaoHTML.replace(/<[^>]*>?/gm, '');

            // --- DIVISA DE ESTADO (LINHA DE DESTAQUE) ---
            if (ufAtual && estadoAnterior && ufAtual !== estadoAnterior) {
                html += `
                    <tr style="background: #0f172a; color: white;">
                        <td colspan="5" style="padding: 12px; text-align: center; font-weight: bold; font-size: 12px; letter-spacing: 2px;">
                            DIVISA DE ESTADO: ENTRANDO EM ${ufAtual} ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
                        </td>
                    </tr>`;
            }
            estadoAnterior = ufAtual;

            // --- LÓGICA DE LIMPEZA DA COLUNA REFERÊNCIA ---
            let viaRef = "Urbano";
            const viaSigla = instrucaoHTML.match(/\b([A-Z]{2}-\d{3,4})\b/); 
            const textoNegrito = instrucaoHTML.match(/<b>(.*?)<\/b>/);

            if (viaSigla) {
                viaRef = viaSigla[1]; // Ex: BR-116, SP-330
            } else if (textoNegrito) {
                const bText = textoNegrito[1].replace(/<[^>]*>?/gm, '');
                // Filtro anti-poluição: não aceita comandos de direção como referência
                const comandosProibidos = /Vire|Mantenha|Siga|Curva|Saída|Esquerda|Direita|Direção|ª/i;
                if (!comandosProibidos.test(bText)) {
                    viaRef = bText;
                }
            }

            html += `
                <tr style="border-bottom: 1px solid #f1f5f9; ${isVazio ? 'background: #fffbeb;' : ''}">
                    <td style="padding: 8px; color: #94a3b8; font-size: 11px;">${globalSeq}</td>
                    <td style="padding: 8px; font-weight: 600; font-size: 11px;">${cidadeUF}</td>
                    <td style="padding: 8px; font-weight: bold; color: #2563eb; font-size: 11px;">${viaRef}</td>
                    <td style="padding: 8px; font-size: 12px; color: #334155;">${instrucaoLimpa}</td>
                    <td style="padding: 8px; font-weight: bold; text-align: right; font-size: 11px;">${step.distance.text}</td>
                </tr>`;
            globalSeq++;
        });
    });

    html += `</tbody></table>`;
    
    // Rodapé da Tabela
    const totalKm = ((distVazioMetros + distRotaMetros) / 1000).toFixed(1);
    html += `
        <div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-top: 2px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; color: #64748b; font-weight: bold;">RELATÓRIO DE VIAGEM OPERACIONAL</span>
            <span style="font-size: 18px; color: #1e293b;">DISTÂNCIA TOTAL: <strong>${totalKm.replace('.', ',')} km</strong></span>
        </div>`;

    listaEscrita.innerHTML = html;
    
    // Chama sua função original de cálculos financeiros
    if (typeof atualizarFinanceiro === "function") atualizarFinanceiro();
}
    
    // Mantém a chamada do financeiro original
    const totalKm = ((distVazioMetros + distRotaMetros) / 1000).toFixed(1);
    html += `
        <div style="margin-top: 10px; padding: 10px; border-top: 2px solid #334155; font-weight: bold; display: flex; justify-content: space-between;">
            <span>RELATÓRIO OPERACIONAL</span>
            <span>TOTAL: ${totalKm.replace('.', ',')} KM</span>
        </div>`;

    listaEscrita.innerHTML = html;
    if (typeof atualizarFinanceiro === "function") atualizarFinanceiro();
}

// --- CÁLCULOS FINANCEIROS (MANTIDO INTEGRAL) ---

function atualizarFinanceiro() {
    const kmVazio = distVazioMetros / 1000; 
    const kmRota = distRotaMetros / 1000; 
    const kmTotal = kmVazio + kmRota;
    const vKmRota = converterParaFloat(document.getElementById("valorPorKm").value);
    const divisor = parseFloat(document.getElementById("imposto").value) || 1;
    const tipoDesl = document.getElementById("tipoDeslocamento").value;
    
    let freteBase = kmRota * vKmRota; 
    let valorDeslocamento = 0;
    
    if (tipoDesl === "remunerado_km") {
        valorDeslocamento = kmVazio * converterParaFloat(document.getElementById("valorDeslocamentoKm").value);
    } else if (tipoDesl === "remunerado_rs") {
        valorDeslocamento = converterParaFloat(document.getElementById("valorDeslocamentoTotal").value);
    }
    
    let baseCalculoParaImposto = freteBase + valorDeslocamento;
    const freteTotalComImposto = baseCalculoParaImposto / divisor;
    const valorDoImposto = freteTotalComImposto - baseCalculoParaImposto;
    const opt = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

    document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
    document.getElementById("txt-km-rota-det").innerText = kmRota.toFixed(1) + " km";
    document.getElementById("txt-km-total").innerText = kmTotal.toFixed(1) + " km";
    document.getElementById("txt-frete-base").innerText = "R$ " + freteBase.toLocaleString('pt-BR', opt);
    document.getElementById("txt-valor-deslocamento-fin").innerText = "R$ " + valorDeslocamento.toLocaleString('pt-BR', opt);
    document.getElementById("txt-valor-imp").innerText = "R$ " + valorDoImposto.toLocaleString('pt-BR', opt);
    document.getElementById("txt-frete-total").innerText = "R$ " + freteTotalComImposto.toLocaleString('pt-BR', opt);

    document.getElementById("txt-an-frete-liquido").innerText = "R$ " + freteTotalComImposto.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-imposto").innerText = "R$ " + valorDoImposto.toLocaleString('pt-BR', opt);

    const precoDiesel = converterParaFloat(document.getElementById("custoDieselLitro").value);
    const consumoDiesel = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
    const precoArla = converterParaFloat(document.getElementById("custoArlaLitro").value);
    const arlaPerc = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
    const pedagio = converterParaFloat(document.getElementById("custoPedagio").value);
    const manutKm = converterParaFloat(document.getElementById("custoManutencaoKm").value);

    const custoDieselTotal = (consumoDiesel > 0) ? (kmTotal / consumoDiesel) * precoDiesel : 0;
    const custoArlaTotal = (consumoDiesel > 0) ? ((kmTotal / consumoDiesel) * arlaPerc) * precoArla : 0;
    const custoManutTotal = kmTotal * manutKm;

    let custoFrioTotal = 0;
    if (document.getElementById("tipoCarga").value === "frigorifica") {
        const consFrio = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        const pColetaStr = document.getElementById("prevColeta").value;
        const pEntregaStr = document.getElementById("prevEntrega").value;
        if (pColetaStr && pEntregaStr) {
            const horas = Math.abs(new Date(pEntregaStr) - new Date(pColetaStr)) / 36e5;
            custoFrioTotal = horas * consFrio * precoDiesel;
            document.getElementById("row-an-frio").style.display = "flex";
            document.getElementById("txt-an-frio").innerText = "R$ " + custoFrioTotal.toLocaleString('pt-BR', opt);
        }
    } else {
        document.getElementById("row-an-frio").style.display = "none";
    }

    const totalCustos = custoDieselTotal + custoArlaTotal + pedagio + custoManutTotal + custoFrioTotal;
    const lucroReal = freteTotalComImposto - totalCustos - valorDoImposto;

    document.getElementById("txt-an-diesel").innerText = "R$ " + custoDieselTotal.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-arla").innerText = "R$ " + custoArlaTotal.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-pedagio").innerText = "R$ " + pedagio.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-manut").innerText = "R$ " + custoManutTotal.toLocaleString('pt-BR', opt);
    document.getElementById("txt-total-custos").innerText = "R$ " + totalCustos.toLocaleString('pt-BR', opt);
    document.getElementById("txt-lucro-real").innerText = "R$ " + lucroReal.toLocaleString('pt-BR', opt);
    document.getElementById("txt-lucro-real").style.color = (lucroReal < 0) ? "#ef4444" : "#16a34a";

    const pVazio = kmTotal > 0 ? (kmVazio / kmTotal * 100) : 0;
    document.getElementById("visual-vazio").style.width = pVazio + "%";
    document.getElementById("perc-vazio").innerText = pVazio.toFixed(1) + "%";
    document.getElementById("perc-rota").innerText = (100 - pVazio).toFixed(1) + "%";
    const rKmReal = kmTotal > 0 ? ((freteBase + valorDeslocamento) / kmTotal) : 0;
    document.getElementById("txt-km-real").innerText = "R$ " + rKmReal.toLocaleString('pt-BR', opt);
}

function limparPainelCustos() {
    ["custoDieselLitro", "consumoDieselMedia", "custoArlaLitro", "arlaPorcentagem", "custoPedagio", "custoManutencaoKm", "consumoFrioHora", "prevColeta", "prevEntrega"].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = "";
    });
    document.getElementById("selFrotaVinculo").value = "";
    document.getElementById("tipoCarga").value = "seca";
    toggleAparelhoFrio();
}

window.onload = () => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=SUA_CHAVE&libraries=places&callback=initApp`;
    script.async = true;
    document.head.appendChild(script);
};



