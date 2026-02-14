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
            google.maps.event.trigger(map, "resize"); 
            if (directionsRenderer.getDirections()) {
                const res = directionsRenderer.getDirections();
                map.fitBounds(res.routes[0].bounds);
            }
        }
    }, 400);
}

// --- GESTÃO DE FROTA ---

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
    if(!container) return;
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
    if(v) {
        document.getElementById('consumoDieselMedia').value = v.consumo;
        document.getElementById('custoManutencaoKm').value = v.manut;
        document.getElementById('arlaPorcentagem').value = v.arla;
        document.getElementById('consumoFrioHora').value = v.consumoFrio || "";
        
        inputsCustos.forEach(id => { 
            const el = document.getElementById(id); 
            if(el) { el.readOnly = true; el.style.opacity = "0.8"; } 
        });
    }
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
    if(!painel) return;
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
    
    if(typeof Sortable !== 'undefined') {
        Sortable.create(document.getElementById('lista-pontos'), { 
            animation: 150, handle: '.handle', draggable: '.sortable-item', 
            onEnd: () => { if(rotaIniciada) calcularRota(); } 
        });
    }

    setupAutocomplete("saida"); 
    setupAutocomplete("origem"); 
    setupAutocomplete("destino");

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
        const res = directionsRenderer.getDirections(); 
        if (res) processarSegmentosRota(res); 
    });

    updateSelects();
    const estadoSalvo = localStorage.getItem('painelCustosEstado');
    if (estadoSalvo) {
        const pc = document.getElementById('painel-custos-extra');
        if(pc) pc.style.display = estadoSalvo;
    }
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

/**
 * Processa a rota para gerar o resumo de "Longa Distância"
 * focado em grandes trechos e cidades de passagem.
 */
function processarSegmentosRota(res) {
    const route = res.routes[0];
    const legs = route.legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    let html = `
        <table class="tabela-roteiro" style="width:100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px;">
            <thead>
                <tr style="background: #f1f1f1; border-bottom: 2px solid #333;">
                    <th style="width: 40px; padding: 10px; text-align: left;">Seq</th>
                    <th style="width: 180px; padding: 10px; text-align: left;">Estrada / Cidade</th>
                    <th style="width: 140px; padding: 10px; text-align: left;">Referência (Via)</th>
                    <th style="padding: 10px; text-align: left;">Nome do Trecho</th>
                    <th style="width: 90px; padding: 10px; text-align: right;">KM</th>
                </tr>
            </thead>
            <tbody>`;

    let globalSeq = 1;
    let estadoAnterior = "";

    legs.forEach((leg) => {
        // ANALISE DO HTML: O Google agrupa por 'manobras principais'. 
        // Vamos filtrar apenas passos que indicam entrada em rodovias ou mudanças de cidade.
        const passosFiltrados = leg.steps.filter(step => {
            const txt = step.instructions;
            // Mantém apenas o que o Google mostra no resumo lateral do Maps
            return step.distance.value > 2000 || /Pegue|Continue|Siga|direção|<b>/.test(txt);
        });

        passosFiltrados.forEach((step) => {
            const instrucaoHTML = step.instructions;
            
            // 1. Extração da Cidade/UF (Exatamente como aparece no seu HTML: "em Jardim Monte Verde, Itatiba")
            let cidadeExibicao = "Rota";
            let ufAtual = "";
            
            // Tenta capturar a cidade que o Google injeta em negrito dentro da instrução
            const bTags = instrucaoHTML.match(/<b>(.*?)<\/b>/g);
            if (bTags && bTags.length >= 2) {
                // Geralmente a segunda ou terceira tag b é a cidade/bairro
                cidadeExibicao = bTags[bTags.length - 1].replace(/<[^>]*>?/gm, '');
            } else {
                // Fallback para o endereço do Leg
                const partes = leg.start_address.split(',');
                cidadeExibicao = partes.length >= 2 ? partes[partes.length - 2].trim() : "Rota";
            }

            // Detecta UF para Divisa
            const matchUF = cidadeExibicao.match(/([A-Z]{2})$/) || leg.start_address.match(/([A-Z]{2}),/);
            ufAtual = matchUF ? matchUF[1] : "";

            // 2. Extração da Via/Referência (BR-381, Rod. Dom Pedro I, etc)
            let viaRef = "Acesso";
            const viaSigla = instrucaoHTML.match(/\b([A-Z]{2}-\d{3})\b/);
            if (viaSigla) {
                viaRef = viaSigla[1];
            } else if (bTags && bTags[0]) {
                viaRef = bTags[0].replace(/<[^>]*>?/gm, '');
            }

            // 3. Linha de Divisa de Estado
            if (ufAtual && estadoAnterior && ufAtual !== estadoAnterior) {
                html += `
                    <tr style="background: #e9ecef; font-weight: bold; border-y: 1px solid #333;">
                        <td style="padding: 5px;">${ufAtual}</td>
                        <td colspan="3" style="padding: 5px; text-align: center;">-------------------------- DIVISA DE ESTADO --------------------------</td>
                        <td style="padding: 5px; text-align: right;">----------</td>
                    </tr>`;
            }
            estadoAnterior = ufAtual;

            // 4. Nome do Trecho (Limpa o HTML mas mantém o sentido do resumo do Google)
            const instrucaoLimpa = instrucaoHTML.replace(/<[^>]*>?/gm, '');

            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px;">${globalSeq++}</td>
                    <td style="padding: 10px;">${cidadeExibicao}</td>
                    <td style="padding: 10px; font-weight: bold; color: #1a56db;">${viaRef}</td>
                    <td style="padding: 10px;">${instrucaoLimpa}</td>
                    <td style="padding: 10px; text-align: right; font-weight: bold;">${step.distance.text}</td>
                </tr>`;
        });
    });

    html += `</tbody></table>`;
    
    const totalDist = (legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000).toFixed(1).replace('.', ',');
    html += `
        <div style="margin-top: 15px; padding: 15px; border: 2px solid #000; display: flex; justify-content: space-between; font-weight: bold; background: #fff;">
            <span>RELATÓRIO DE VIAGEM OPERACIONAL</span>
            <span>TOTAL: ${totalDist} KM</span>
        </div>`;

    if (listaEscrita) listaEscrita.innerHTML = html;
    if (typeof atualizarFinanceiro === "function") atualizarFinanceiro();
}
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

    if(document.getElementById("txt-km-vazio-det")) document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
    if(document.getElementById("txt-km-rota-det")) document.getElementById("txt-km-rota-det").innerText = kmRota.toFixed(1) + " km";
    if(document.getElementById("txt-km-total")) document.getElementById("txt-km-total").innerText = kmTotal.toFixed(1) + " km";
    if(document.getElementById("txt-frete-base")) document.getElementById("txt-frete-base").innerText = "R$ " + freteBase.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-valor-deslocamento-fin")) document.getElementById("txt-valor-deslocamento-fin").innerText = "R$ " + valorDeslocamento.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-valor-imp")) document.getElementById("txt-valor-imp").innerText = "R$ " + valorDoImposto.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-frete-total")) document.getElementById("txt-frete-total").innerText = "R$ " + freteTotalComImposto.toLocaleString('pt-BR', opt);

    if(document.getElementById("txt-an-frete-liquido")) document.getElementById("txt-an-frete-liquido").innerText = "R$ " + freteTotalComImposto.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-an-imposto")) document.getElementById("txt-an-imposto").innerText = "R$ " + valorDoImposto.toLocaleString('pt-BR', opt);

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
    const tipoCargaEl = document.getElementById("tipoCarga");
    if (tipoCargaEl && tipoCargaEl.value === "frigorifica") {
        const consFrio = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        const pColetaStr = document.getElementById("prevColeta").value;
        const pEntregaStr = document.getElementById("prevEntrega").value;
        if (pColetaStr && pEntregaStr) {
            const horas = Math.abs(new Date(pEntregaStr) - new Date(pColetaStr)) / 36e5;
            custoFrioTotal = horas * consFrio * precoDiesel;
            const rowFrio = document.getElementById("row-an-frio");
            if(rowFrio) {
                rowFrio.style.display = "flex";
                document.getElementById("txt-an-frio").innerText = "R$ " + custoFrioTotal.toLocaleString('pt-BR', opt);
            }
        }
    } else if(document.getElementById("row-an-frio")) {
        document.getElementById("row-an-frio").style.display = "none";
    }

    const totalCustos = custoDieselTotal + custoArlaTotal + pedagio + custoManutTotal + custoFrioTotal;
    const lucroReal = freteTotalComImposto - totalCustos - valorDoImposto;

    if(document.getElementById("txt-an-diesel")) document.getElementById("txt-an-diesel").innerText = "R$ " + custoDieselTotal.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-an-arla")) document.getElementById("txt-an-arla").innerText = "R$ " + custoArlaTotal.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-an-pedagio")) document.getElementById("txt-an-pedagio").innerText = "R$ " + pedagio.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-an-manut")) document.getElementById("txt-an-manut").innerText = "R$ " + custoManutTotal.toLocaleString('pt-BR', opt);
    if(document.getElementById("txt-total-custos")) document.getElementById("txt-total-custos").innerText = "R$ " + totalCustos.toLocaleString('pt-BR', opt);
    
    const elLucro = document.getElementById("txt-lucro-real");
    if(elLucro) {
        elLucro.innerText = "R$ " + lucroReal.toLocaleString('pt-BR', opt);
        elLucro.style.color = (lucroReal < 0) ? "#ef4444" : "#16a34a";
    }

    const pVazio = kmTotal > 0 ? (kmVazio / kmTotal * 100) : 0;
    if(document.getElementById("visual-vazio")) document.getElementById("visual-vazio").style.width = pVazio + "%";
    if(document.getElementById("perc-vazio")) document.getElementById("perc-vazio").innerText = pVazio.toFixed(1) + "%";
    if(document.getElementById("perc-rota")) document.getElementById("perc-rota").innerText = (100 - pVazio).toFixed(1) + "%";
    
    const rKmReal = kmTotal > 0 ? ((freteBase + valorDeslocamento) / kmTotal) : 0;
    if(document.getElementById("txt-km-real")) document.getElementById("txt-km-real").innerText = "R$ " + rKmReal.toLocaleString('pt-BR', opt);
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
}

window.onload = () => {
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyClbY5ZvkjrMGP4nJmZzCcm4hUu5-fjZV0&libraries=places&callback=initApp";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
};













