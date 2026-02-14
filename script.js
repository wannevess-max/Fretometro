let map, directionsRenderer, directionsService, paradasData = {}, rotaIniciada = true;
let distVazioMetros = 0, distRotaMetros = 0;
let frota = JSON.parse(localStorage.getItem('frota_db')) || [];

const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] }, 
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] }, 
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] }, 
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }, 
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
];

// --- FUNÇÕES DE INTERFACE COM MEMÓRIA ---

function toggleFrota() { 
    const painel = document.getElementById('painel-frota');
    if(painel) painel.classList.toggle('active');
    renderFrota();
}

function toggleGoogleMaps() {
    const painel = document.getElementById('painel-roteiro-escrito');
    if(painel) {
        painel.classList.toggle('active');
        // Salva o estado no navegador
        localStorage.setItem('keep_roteiro', painel.classList.contains('active'));
    }
    
    setTimeout(() => { 
        if(typeof google !== 'undefined' && map) {
            google.maps.event.trigger(map, 'resize');
        }
    }, 300);
}

function toggleCustos() {
    const body = document.body;
    const painelCustos = document.getElementById('painel-custos-extra');
    
    body.classList.toggle('custos-open');
    const isOpen = body.classList.contains('custos-open');
    
    // Salva o estado no navegador
    localStorage.setItem('keep_custos', isOpen);
    
    if (painelCustos) {
        painelCustos.style.display = isOpen ? 'block' : 'none';
        if (isOpen) carregarSelectFrota();
    }

    setTimeout(() => {
        if (typeof google !== 'undefined' && map) {
            google.maps.event.trigger(map, 'resize');
        }
    }, 300);
}

// Restaura a posição dos painéis ao carregar a página
function restaurarPosicaoPaineis() {
    const roteiroAberto = localStorage.getItem('keep_roteiro') === 'true';
    const custosAberto = localStorage.getItem('keep_custos') === 'true';

    if (roteiroAberto) {
        document.getElementById('painel-roteiro-escrito')?.classList.add('active');
    }

    if (custosAberto) {
        document.body.classList.add('custos-open');
        const p = document.getElementById('painel-custos-extra');
        if (p) {
            p.style.display = 'block';
            carregarSelectFrota();
        }
    }
}

function limparPainelCustos() {
    document.getElementById("custoDieselLitro").value = "";
    document.getElementById("consumoDieselMedia").value = "";
    document.getElementById("custoArlaLitro").value = "";
    document.getElementById("arlaPorcentagem").value = "";
    document.getElementById("custoPedagio").value = "";
    document.getElementById("custoManutencaoKm").value = "";
    document.getElementById("consumoFrioHora").value = "";
    document.getElementById('selFrotaVinculo').value = "";
    atualizarFinanceiro();
}

function toggleAparelhoFrio() {
    const tipo = document.getElementById("tipoCarga").value;
    const div = document.getElementById("container-frio-input");
    const rowAn = document.getElementById("row-an-frio");
    const containerDatas = document.getElementById("container-frio-datas");
    
    if(tipo === "frigorifica") {
        div.style.display = "block";
        rowAn.style.display = "flex";
        containerDatas.style.display = "block";
    } else {
        div.style.display = "none";
        rowAn.style.display = "none";
        containerDatas.style.display = "none";
    }
    atualizarFinanceiro();
}

// --- LÓGICA DO MAPA ---

function initMap() {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: {
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 5
        }
    });

    const centroBR = { lat: -15.793889, lng: -47.882778 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 4,
        center: centroBR,
        styles: [] 
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
    
    // Inicializa a restauração do layout salvo
    restaurarPosicaoPaineis();

    // Gatilhos automáticos para campos de texto ao perder o foco (blur)
    document.getElementById("origem")?.addEventListener('blur', calcularRota);
    document.getElementById("destino")?.addEventListener('blur', calcularRota);
    document.getElementById("saida")?.addEventListener('blur', calcularRota);
}

function setupAutocomplete() {
    const inputs = ["origem", "destino", "saida"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            const autocomplete = new google.maps.places.Autocomplete(el);
            // Chama o cálculo automaticamente ao selecionar local da lista
            autocomplete.addListener('place_changed', () => {
                calcularRota();
            });
        }
    });
}

function calcularRota() {
    const origem = document.getElementById("origem").value;
    const destino = document.getElementById("destino").value;
    const pontoVazio = document.getElementById("saida").value;

    // Sai da função silenciosamente se os campos principais não estiverem preenchidos
    if(!origem || !destino) {
        return;
    }

    rotaIniciada = true;

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
            processarSegmentosRota(res);
        }
    });
}

function processarSegmentosRota(res) {
    const route = res.routes[0];
    const legs = route.legs;
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    
    let html = `<div style="padding: 10px; font-family: sans-serif; color: #1e293b;">`;

    legs.forEach((leg, index) => {
        html += `<div style="font-weight: bold; font-size: 15px; margin-bottom: 15px; color: #2563eb;">${leg.start_address.split(',')[0]}</div>`;
        
        let resumoAgrupado = [];
        let itemAtual = null;

        leg.steps.forEach((step) => {
            const instructions = step.instructions;
            const matches = instructions.match(/<b>(.*?)<\/b>/g) || [];
            const viaPrincipal = matches[0] ? matches[0].replace(/<[^>]*>?/gm, '') : "Vias locais";

            if (itemAtual && (itemAtual.via === viaPrincipal || step.distance.value < 15000)) {
                itemAtual.distancia += step.distance.value;
                itemAtual.duracao += step.duration.value;
            } else {
                if (itemAtual) resumoAgrupado.push(itemAtual);
                itemAtual = {
                    via: viaPrincipal,
                    instrucao: instructions.split('<div')[0],
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
    listaEscrita.innerHTML = html;
    atualizarFinanceiro();
}

// --- LÓGICA FINANCEIRA ---

function parseMoeda(valor) {
    if(!valor) return 0;
    return parseFloat(valor.toString().replace("R$ ","").replace(/\./g, "").replace(",",".")) || 0;
}

function atualizarFinanceiro() {
    if (!rotaIniciada) return;

    const kmTotal = (distRotaMetros / 1000);
    const kmVazio = (distVazioMetros / 1000);
    const kmGeral = kmTotal + kmVazio;

    const dieselL = parseMoeda(document.getElementById("custoDieselLitro").value);
    const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
    const arlaL = parseMoeda(document.getElementById("custoArlaLitro").value);
    const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
    const pedagio = parseMoeda(document.getElementById("custoPedagio").value);
    const manutKm = parseMoeda(document.getElementById("custoManutencaoKm").value);
    const freteKmInput = parseMoeda(document.getElementById("valorPorKm").value);
    const impostoP = parseFloat(document.getElementById("imposto").value) || 1;

    const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
    const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
    const custoManut = kmGeral * manutKm;
    
    let custoFrio = 0;
    if(document.getElementById("tipoCarga").value === "frigorifica") {
        const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        custoFrio = consH * dieselL * 5; 
    }

    const totalCustos = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
    const freteLiq = (freteKmInput * kmTotal) * impostoP;
    const lucro = freteLiq - totalCustos;

    const opt = { style: 'currency', currency: 'BRL' };
    
    document.getElementById("txt-km-total").innerText = kmGeral.toFixed(1) + " km";
    document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
    document.getElementById("txt-km-rota-det").innerText = kmTotal.toFixed(1) + " km";

    document.getElementById("txt-an-diesel").innerText = custoCombustivel.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-pedagio").innerText = pedagio.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-manut").innerText = custoManut.toLocaleString('pt-BR', opt);
    document.getElementById("txt-an-frio").innerText = custoFrio.toLocaleString('pt-BR', opt);
    document.getElementById("txt-total-custos").innerText = totalCustos.toLocaleString('pt-BR', opt);
    document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);

    document.getElementById("txt-frete-base").innerText = (freteKmInput * kmTotal).toLocaleString('pt-BR', opt);
    document.getElementById("txt-frete-total").innerText = freteLiq.toLocaleString('pt-BR', opt);
    document.getElementById("txt-km-real").innerText = (kmTotal > 0 ? (freteLiq / kmTotal) : 0).toLocaleString('pt-BR', opt);

    const pVazio = kmGeral > 0 ? (kmVazio / kmGeral) * 100 : 0;
    const pRota = kmGeral > 0 ? (kmTotal / kmGeral) * 100 : 100;
    document.getElementById("visual-vazio").style.width = pVazio + "%";
    document.getElementById("visual-rota").style.width = pRota + "%";
    document.getElementById("perc-vazio").innerText = pVazio.toFixed(0) + "%";
    document.getElementById("perc-rota").innerText = pRota.toFixed(0) + "%";
}

// --- GESTÃO DE PARADAS ---

function adicionarParada() {
    const container = document.getElementById("lista-pontos");
    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `
        <span class="handle">☰</span>
        <input type="text" class="parada-input" placeholder="Parada intermediária..." autocomplete="off">
        <button onclick="this.parentElement.remove(); calcularRota();" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    const destino = document.getElementById("li-destino");
    container.insertBefore(li, destino);
    
    const input = li.querySelector("input");
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.addListener('place_changed', () => {
        calcularRota();
    });
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
        document.getElementById("consumoDieselMedia").value = v.media;
        document.getElementById("custoManutencaoKm").value = v.manut;
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
            <button onclick="excluirVeiculo(${v.id})" style="padding:5px 10px; font-size:10px; background:red; color:white; border:none; border-radius:4px;">×</button>
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
    document.getElementById("f-nome").value = "";
    document.getElementById("f-consumo").value = "";
    document.getElementById("f-manut").value = "";
    document.getElementById("f-arla").value = "";
}

function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, "");
    valor = (valor / 100).toFixed(2).replace(".", ",");
    input.value = "R$ " + valor;
}

// Escuta mudanças nos inputs de custo para atualizar tempo real
["custoDieselLitro", "consumoDieselMedia", "custoArlaLitro", "arlaPorcentagem", "custoPedagio", "custoManutencaoKm", "valorPorKm"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', atualizarFinanceiro);
});

document.getElementById('imposto')?.addEventListener('change', atualizarFinanceiro);

// --- Lógica de Exibição Dinâmica de Deslocamento ---

// Função para inicializar os ouvintes de evento (chame isso ou garanta que o DOM carregou)
document.addEventListener("DOMContentLoaded", function() {
    
    const campoSaida = document.getElementById("saida");
    const containerDeslocamento = document.getElementById("container-config-deslocamento");
    const selectTipo = document.getElementById("tipoDeslocamento");
    const inputKm = document.getElementById("valorDeslocamentoKm");
    const inputTotal = document.getElementById("valorDeslocamentoTotal");

    if (campoSaida) {
        campoSaida.addEventListener("input", function() {
            if (this.value.trim() !== "") {
                containerDeslocamento.style.display = "flex";
            } else {
                containerDeslocamento.style.display = "none";
                // Resetar campos se apagar o endereço
                selectTipo.value = "nao_remunerado";
                inputKm.style.display = "none";
                inputTotal.style.display = "none";
            }
        });
    }

    if (selectTipo) {
        selectTipo.addEventListener("change", function() {
            inputKm.style.display = "none";
            inputTotal.style.display = "none";

            if (this.value === "remunerado_km") {
                inputKm.style.display = "block";
            } else if (this.value === "remunerado_rs") {
                inputTotal.style.display = "block";
            }
        });
    }
});
