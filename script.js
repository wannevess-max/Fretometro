let map, directionsRenderer, directionsService, paradasData = {}, rotaIniciada = true;
let distVazioMetros = 0, distRotaMetros = 0; // Adicionado para controle de deslocamento
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
        localStorage.setItem('keep_roteiro', painel.classList.contains('active'));
    }
}

function toggleCustos() {
    const painel = document.getElementById('painel-custos-extra');
    if(!painel) return;
    const isVisible = painel.style.display === 'block';
    painel.style.display = isVisible ? 'none' : 'block';
    localStorage.setItem('painelCustosEstado', painel.style.display);
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if(map) map.setOptions({ styles: isDark ? darkStyle : [] });
}

// --- CORE LOGÍSTICA ---

function initApp() {
    // Restaurar Tema
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: -14.235, lng: -51.925 },
        zoom: 4,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        styles: document.body.classList.contains('dark-mode') ? darkStyle : []
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        draggable: true,
        map: map,
        panel: document.getElementById("lista-passo-a-passo")
    });

    // Sortable
    const lista = document.getElementById('lista-pontos');
    Sortable.create(lista, {
        animation: 150,
        handle: '.handle',
        draggable: '.sortable-item',
        onEnd: function() {
            calcularRota();
        }
    });

    // Autocompletes Iniciais
    setupAutocomplete("saida");
    setupAutocomplete("origem");
    setupAutocomplete("destino");

    // Listeners Globais
    document.getElementById("btnCalcular").addEventListener("click", calcularRota);
    document.getElementById("btnAddParada").addEventListener("click", adicionarCampoParada);
    document.getElementById("imposto").addEventListener("change", atualizarFinanceiro);
    document.getElementById("valorPorKm").addEventListener("input", function() {
        formatarMoeda(this);
        atualizarFinanceiro();
    });

    // Restaurar estado do painel de custos
    if(localStorage.getItem('painelCustosEstado') === 'block') {
        document.getElementById('painel-custos-extra').style.display = 'block';
    }

    directionsRenderer.addListener('directions_changed', function() {
        const result = directionsRenderer.getDirections();
        if (result) {
            processarSegmentosRota(result);
        }
    });

    updateSelects();
}

function setupAutocomplete(id) {
    const input = document.getElementById(id);
    if (!input) return;

    const autocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "br" },
        fields: ["place_id", "geometry", "formatted_address"]
    });

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;

        paradasData[id] = place.place_id;

        // INSERÇÃO: Mostrar config de deslocamento se preencher saída
        if (id === "saida") {
            const container = document.getElementById("container-config-deslocamento");
            if (container) container.style.display = "flex";
        }

        if (rotaIniciada) calcularRota();
    });
}

function adicionarCampoParada() {
    const lista = document.getElementById("lista-pontos");
    const destinoItem = document.getElementById("li-destino");
    const idUnico = "parada_" + Date.now();

    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `
        <span class="handle">☰</span>
        <input id="${idUnico}" type="text" placeholder="Carregamento / Entrega" autocomplete="off">
        <button class="btn-remove" onclick="removerPonto(this, '${idUnico}')">✕</button>
    `;

    lista.insertBefore(li, destinoItem);
    setupAutocomplete(idUnico);
}

function removerPonto(btn, id) {
    btn.parentElement.remove();
    delete paradasData[id];
    if (rotaIniciada) calcularRota();
}

function calcularRota() {
    const inputs = Array.from(document.querySelectorAll("#lista-pontos input[type='text']"));
    const locaisValidos = inputs
        .map(input => ({ id: input.id, placeId: paradasData[input.id] }))
        .filter(item => item.placeId);

    if (locaisValidos.length < 2) return;

    const origin = { placeId: locaisValidos[0].placeId };
    const destination = { placeId: locaisValidos[locaisValidos.length - 1].placeId };
    const waypoints = locaisValidos.slice(1, -1).map(item => ({
        location: { placeId: item.placeId },
        stopover: true
    }));

    directionsService.route({
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false
    }, (response, status) => {
        if (status === "OK") {
            directionsRenderer.setDirections(response);
            rotaIniciada = true;
            processarSegmentosRota(response);
        } else {
            alert("Erro ao calcular rota: " + status);
        }
    });
}

function processarSegmentosRota(response) {
    const route = response.routes[0];
    const legs = route.legs;
    const temSaida = document.getElementById("saida").value.trim() !== "";

    // INSERÇÃO: Lógica para separar Vazio de Carregado
    if (temSaida && legs.length >= 2) {
        distVazioMetros = legs[0].distance.value;
        distRotaMetros = legs.slice(1).reduce((acc, leg) => acc + leg.distance.value, 0);
    } else {
        distVazioMetros = 0;
        distRotaMetros = legs.reduce((acc, leg) => acc + leg.distance.value, 0);
    }

    atualizarFinanceiro();
}

function atualizarFinanceiro() {
    const kmVazio = distVazioMetros / 1000;
    const kmRota = distRotaMetros / 1000;
    const kmTotal = kmVazio + kmRota;

    const valorKmInput = document.getElementById("valorPorKm").value;
    const valorPorKm = converterParaFloat(valorKmInput);
    const impostoPercentual = parseFloat(document.getElementById("imposto").value) || 1;

    // INSERÇÃO: Lógica de remuneração do deslocamento
    const tipoDeslocamento = document.getElementById("tipoDeslocamento").value;
    let valorDeslocamento = 0;

    if (tipoDeslocamento === "remunerado_km") {
        const vKmVazio = converterParaFloat(document.getElementById("valorDeslocamentoKm").value);
        valorDeslocamento = kmVazio * vKmVazio;
    } else if (tipoDeslocamento === "remunerado_rs") {
        valorDeslocamento = converterParaFloat(document.getElementById("valorDeslocamentoTotal").value);
    }

    const freteBase = kmRota * valorPorKm;
    const baseCalculoComImposto = (freteBase + valorDeslocamento) / impostoPercentual;
    const valorImposto = baseCalculoComImposto - (freteBase + valorDeslocamento);
    const freteTotalLiquido = freteBase + valorDeslocamento;

    // Atualizar UI
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    
    // Campos novos de detalhamento de KM
    const elKmVazio = document.getElementById("txt-km-vazio-det");
    const elKmRota = document.getElementById("txt-km-rota-det");
    const elKmTotal = document.getElementById("txt-km-total");
    const elValDesl = document.getElementById("txt-valor-deslocamento-fin");

    if(elKmVazio) elKmVazio.innerText = kmVazio.toFixed(1) + " km";
    if(elKmRota) elKmRota.innerText = kmRota.toFixed(1) + " km";
    if(elKmTotal) elKmTotal.innerText = kmTotal.toFixed(1) + " km";
    if(elValDesl) elValDesl.innerText = "R$ " + valorDeslocamento.toLocaleString('pt-BR', options);

    document.getElementById("txt-frete-base").innerText = "R$ " + freteBase.toLocaleString('pt-BR', options);
    document.getElementById("txt-valor-imp").innerText = "R$ " + valorImposto.toLocaleString('pt-BR', options);
    document.getElementById("txt-frete-total").innerText = "R$ " + baseCalculoComImposto.toLocaleString('pt-BR', options);

    // Barra visual
    const pVazio = kmTotal > 0 ? (kmVazio / kmTotal * 100) : 0;
    document.getElementById("visual-vazio").style.width = pVazio + "%";
    document.getElementById("perc-vazio").innerText = pVazio.toFixed(1) + "%";
    document.getElementById("perc-rota").innerText = (100 - pVazio).toFixed(1) + "%";

    const rKmReal = kmTotal > 0 ? ((freteBase + valorDeslocamento) / kmTotal) : 0;
    document.getElementById("txt-km-real").innerText = "R$ " + rKmReal.toLocaleString('pt-BR', options);

    calcularCustosOperacionais(kmTotal, baseCalculoComImposto, valorImposto);
}

// --- CUSTOS ADICIONAIS ---

function calcularCustosOperacionais(kmTotal, freteBruto, valorImposto) {
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

    const precoDiesel = converterParaFloat(document.getElementById("custoDieselLitro").value);
    const consumoDiesel = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
    const precoArla = converterParaFloat(document.getElementById("custoArlaLitro").value);
    const arlaPorcentagem = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
    const pedagio = converterParaFloat(document.getElementById("custoPedagio").value);
    const manutencaoKm = converterParaFloat(document.getElementById("custoManutencaoKm").value);

    const custoDieselTotal = (consumoDiesel > 0) ? (kmTotal / consumoDiesel) * precoDiesel : 0;
    const custoArlaTotal = (consumoDiesel > 0) ? ((kmTotal / consumoDiesel) * arlaPorcentagem) * precoArla : 0;
    const custoManutencaoTotal = kmTotal * manutencaoKm;

    let custoFrioTotal = 0;
    if (document.getElementById("tipoCarga").value === "frigorifica") {
        const consumoFrioHora = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
        const dataColeta = new Date(document.getElementById("prevColeta").value);
        const dataEntrega = new Date(document.getElementById("prevEntrega").value);

        if (dataColeta && dataEntrega && dataEntrega > dataColeta) {
            const diffMs = Math.abs(dataEntrega - dataColeta);
            const horasTotal = diffMs / (1000 * 60 * 60);
            custoFrioTotal = horasTotal * consumoFrioHora * precoDiesel;
            document.getElementById("row-an-frio").style.display = "flex";
            document.getElementById("txt-an-frio").innerText = "R$ " + custoFrioTotal.toLocaleString('pt-BR', options);
            document.getElementById("alerta-datas-frio").style.display = "none";
            document.getElementById("alerta-erro-datas").style.display = "none";
        } else {
            document.getElementById("row-an-frio").style.display = "none";
            if (document.getElementById("prevColeta").value === "" || document.getElementById("prevEntrega").value === "") {
                document.getElementById("alerta-datas-frio").style.display = "block";
                document.getElementById("alerta-erro-datas").style.display = "none";
            } else {
                document.getElementById("alerta-erro-datas").style.display = "block";
                document.getElementById("alerta-datas-frio").style.display = "none";
            }
        }
    } else {
        document.getElementById("row-an-frio").style.display = "none";
        document.getElementById("alerta-datas-frio").style.display = "none";
        document.getElementById("alerta-erro-datas").style.display = "none";
    }

    const totalCustos = custoDieselTotal + custoArlaTotal + pedagio + custoManutencaoTotal + custoFrioTotal;
    const freteLiquido = freteBruto - valorImposto;
    const lucroReal = freteLiquido - totalCustos;

    document.getElementById("txt-an-diesel").innerText = "R$ " + custoDieselTotal.toLocaleString('pt-BR', options);
    document.getElementById("txt-an-arla").innerText = "R$ " + custoArlaTotal.toLocaleString('pt-BR', options);
    document.getElementById("txt-an-pedagio").innerText = "R$ " + pedagio.toLocaleString('pt-BR', options);
    document.getElementById("txt-an-manut").innerText = "R$ " + custoManutencaoTotal.toLocaleString('pt-BR', options);
    document.getElementById("txt-total-custos").innerText = "R$ " + totalCustos.toLocaleString('pt-BR', options);
    document.getElementById("txt-an-frete-liquido").innerText = "R$ " + freteLiquido.toLocaleString('pt-BR', options);
    document.getElementById("txt-an-imposto").innerText = "R$ " + valorImposto.toLocaleString('pt-BR', options);
    
    const txtLucro = document.getElementById("txt-lucro-real");
    txtLucro.innerText = "R$ " + lucroReal.toLocaleString('pt-BR', options);
    txtLucro.style.color = lucroReal < 0 ? "#ef4444" : "#16a34a";
}

// --- UTILITÁRIOS ---

function formatarMoeda(input) {
    let value = input.value.replace(/\D/g, "");
    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    input.value = "R$ " + value;
}

function converterParaFloat(stringMoeda) {
    if (!stringMoeda) return 0;
    let limpo = stringMoeda.replace("R$ ", "").replace(/\./g, "").replace(",", ".");
    return parseFloat(limpo) || 0;
}

function limparPainelCustos() {
    const ids = ["custoDieselLitro", "consumoDieselMedia", "custoArlaLitro", "arlaPorcentagem", "custoPedagio", "custoManutencaoKm", "consumoFrioHora", "prevColeta", "prevEntrega"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    document.getElementById("selFrotaVinculo").value = "";
    document.getElementById("tipoCarga").value = "seca";
    toggleAparelhoFrio();
    atualizarFinanceiro();
}

function toggleAparelhoFrio() {
    const tipo = document.getElementById("tipoCarga").value;
    const isFrigo = tipo === "frigorifica";
    document.getElementById("container-frio-input").style.display = isFrigo ? "block" : "none";
    document.getElementById("container-frio-datas").style.display = isFrigo ? "block" : "none";
    atualizarFinanceiro();
}

// --- GESTÃO DE FROTA ---

function salvarVeiculo() {
    const nome = document.getElementById('f-nome').value;
    if(!nome) return;

    const veiculo = {
        nome: nome,
        eixos: document.getElementById('f-eixos').value,
        consumo: document.getElementById('f-consumo').value,
        manut: document.getElementById('f-manut').value,
        arla: document.getElementById('f-arla').value,
        temFrio: document.getElementById('f-tem-frio').checked,
        consumoFrio: document.getElementById('f-consumo-frio').value
    };

    const editIndex = parseInt(document.getElementById('f-edit-index').value);
    if(editIndex === -1) {
        frota.push(veiculo);
    } else {
        frota[editIndex] = veiculo;
    }

    localStorage.setItem('frota_db', JSON.stringify(frota));
    limparFormFrota();
    renderFrota();
    updateSelects();
}

function limparFormFrota() {
    document.getElementById('f-edit-index').value = "-1";
    document.getElementById('f-nome').value = "";
    document.getElementById('f-consumo').value = "";
    document.getElementById('f-manut').value = "";
    document.getElementById('f-arla').value = "";
    document.getElementById('f-tem-frio').checked = false;
    document.getElementById('f-consumo-frio').value = "";
    document.getElementById('f-box-frio').style.display = 'none';
    document.getElementById('frota-titulo').innerText = "Minha Frota";
}

function renderFrota() {
    const lista = document.getElementById('lista-v-render');
    if(!lista) return;
    lista.innerHTML = "";

    frota.forEach((v, i) => {
        const div = document.createElement('div');
        div.className = "veiculo-card";
        div.innerHTML = `
            <div>
                <strong>${v.nome}</strong><br>
                <small>${v.eixos} eixos | ${v.consumo} km/L</small>
            </div>
            <div>
                <button onclick="editV(${i})" style="background:none; border:none; cursor:pointer;">✏️</button>
                <button onclick="delV(${i})" style="background:none; border:none; cursor:pointer;">🗑️</button>
            </div>
        `;
        lista.appendChild(div);
    });
}

function delV(i) {
    if(confirm("Excluir este veículo?")) {
        frota.splice(i, 1);
        localStorage.setItem('frota_db', JSON.stringify(frota));
        renderFrota();
        updateSelects();
    }
}

function editV(i) {
    const v = frota[i];
    document.getElementById('f-edit-index').value = i;
    document.getElementById('f-nome').value = v.nome;
    document.getElementById('f-eixos').value = v.eixos;
    document.getElementById('f-consumo').value = v.consumo;
    document.getElementById('f-manut').value = v.manut;
    document.getElementById('f-arla').value = v.arla;
    document.getElementById('f-tem-frio').checked = v.temFrio;
    document.getElementById('f-consumo-frio').value = v.consumoFrio || "";
    document.getElementById('f-box-frio').style.display = v.temFrio ? 'block' : 'none';
    document.getElementById('frota-titulo').innerText = "Editando Veículo";
}

function updateSelects() {
    const sel = document.getElementById('selFrotaVinculo');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecione um veículo...</option><option value="manual">Inserir Manualmente</option>';
    frota.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = v.nome;
        sel.appendChild(opt);
    });
}

function vincularFrota(sel) {
    const val = sel.value;
    if(val === "" || val === "manual") return;
    const v = frota[val];
    document.getElementById('consumoDieselMedia').value = v.consumo;
    document.getElementById('custoManutencaoKm').value = v.manut;
    document.getElementById('arlaPorcentagem').value = v.arla;
    if(v.temFrio) {
        document.getElementById('tipoCarga').value = "frigorifica";
        document.getElementById('consumoFrioHora').value = v.consumoFrio;
        toggleAparelhoFrio();
    } else {
        document.getElementById('tipoCarga').value = "seca";
        toggleAparelhoFrio();
    }
    atualizarFinanceiro();
}

// Carregar API Google
window.onload = () => {
    const apiKey = "AIzaSyClbY5ZvkjrMGP4nJmZzCcm4hUu5-fjZV0";
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initApp`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
};

// INSERÇÃO: Listener para os campos de deslocamento
document.addEventListener("DOMContentLoaded", function() {
    const selectTipo = document.getElementById("tipoDeslocamento");
    const inputKm = document.getElementById("valorDeslocamentoKm");
    const inputTotal = document.getElementById("valorDeslocamentoTotal");

    if (selectTipo) {
        selectTipo.addEventListener("change", function() {
            inputKm.style.display = "none";
            inputTotal.style.display = "none";
            if (this.value === "remunerado_km") inputKm.style.display = "block";
            else if (this.value === "remunerado_rs") inputTotal.style.display = "block";
            atualizarFinanceiro();
        });
    }
});
