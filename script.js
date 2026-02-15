let map, directionsRenderer, directionsService, rotaIniciada = false;
let distVazioMetros = 0, distRotaMetros = 0;
let frota = JSON.parse(localStorage.getItem('frota_db')) || [];

// --- INICIALIZAÇÃO DO MAPA ---
function initMap() {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: '#2563eb', strokeOpacity: 0.8, strokeWeight: 5 }
    });

    const centroBR = { lat: -15.793889, lng: -47.882778 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 4, center: centroBR, disableDefaultUI: false
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
    restaurarPosicaoPaineis();
    
    const el = document.getElementById('lista-pontos');
    if (el && typeof Sortable !== 'undefined') {
        Sortable.create(el, { handle: '.handle', animation: 150, onEnd: calcularRota });
    }
}

function setupAutocomplete() {
    const inputs = ["origem", "destino", "saida"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const autocomplete = new google.maps.places.Autocomplete(el);
            autocomplete.addListener('place_changed', () => { calcularRota(); });
            el.addEventListener('blur', calcularRota);
        }
    });
}

// --- LÓGICA DE ROTAS ---
function calcularRota() {
    const origem = document.getElementById("origem").value;
    const destino = document.getElementById("destino").value;
    const pontoVazio = document.getElementById("saida").value;
    if (!origem || !destino) return;
    
    rotaIniciada = true;
    if (pontoVazio) {
        directionsService.route({
            origin: pontoVazio, destination: origem, travelMode: 'DRIVING'
        }, (res, status) => {
            distVazioMetros = (status === 'OK') ? res.routes[0].legs[0].distance.value : 0;
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
        if (node.value) waypoints.push({ location: node.value, stopover: true });
    });
    directionsService.route({
        origin: origem,
        destination: destino,
        waypoints: waypoints,
        travelMode: 'DRIVING',
        optimizeWaypoints: true
    }, (res, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(res);
            distRotaMetros = res.routes[0].legs.reduce((acc, leg) => acc + leg.distance.value, 0);
            processarSegmentosRota(res);
        }
    });
}

// --- FORMATAÇÃO E PARSE ---
function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, "");
    if (!valor || valor === "0") {
        input.value = "R$ 0,00";
        return;
    }
    let valorNumerico = (parseFloat(valor) / 100).toFixed(2);
    input.value = "R$ " + valorNumerico
        .replace(".", ",")
        .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

function parseMoeda(valor) {
    if (!valor || valor === "R$ 0,00") return 0;
    let limpo = valor.toString().replace(/R\$\s?|[.]|\s/g, "").replace(",", ".");
    return parseFloat(limpo) || 0;
}

// --- CÁLCULOS FINANCEIROS ---
function atualizarFinanceiro() {
    if (!rotaIniciada) return;

    try {
        const kmTotal = (distRotaMetros / 1000) || 0;
        const kmVazio = (distVazioMetros / 1000) || 0;
        const kmGeral = kmTotal + kmVazio;

        const dieselL = parseMoeda(document.getElementById("custoDieselLitro").value);
        const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
        const arlaL = parseMoeda(document.getElementById("custoArlaLitro").value);
        const arlaP = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
        const pedagio = parseMoeda(document.getElementById("custoPedagio").value);
        const manutKm = parseMoeda(document.getElementById("custoManutencaoKm").value);
        const freteKmInput = parseMoeda(document.getElementById("valorPorKm").value);
        const vDescarga = parseMoeda(document.getElementById("valorDescarga").value);
        const vOutras = parseMoeda(document.getElementById("valorOutrasDespesas").value);
        const impostoFator = parseFloat(document.getElementById("imposto").value) || 1;

        let valorDeslocamentoFinal = 0;
        const tipoDesloc = document.getElementById("tipoDeslocamento").value;
        const boxKm = document.getElementById("box-valor-deslocamento-km");
        const boxTotal = document.getElementById("box-valor-deslocamento-total");

        if (boxKm) boxKm.style.display = (tipoDesloc === "remunerado_km") ? "block" : "none";
        if (boxTotal) boxTotal.style.display = (tipoDesloc === "remunerado_rs") ? "block" : "none";

        if (tipoDesloc === "remunerado_km") {
            const valInputKm = parseMoeda(document.getElementById("inputValorDeslocamentoKm").value);
            valorDeslocamentoFinal = kmVazio * valInputKm;
        } else if (tipoDesloc === "remunerado_rs") {
            valorDeslocamentoFinal = parseMoeda(document.getElementById("inputValorDeslocamentoTotal").value);
        }

        const freteBaseCarregado = freteKmInput * kmTotal;
        const totalBruto = freteBaseCarregado + valorDeslocamentoFinal + vDescarga + vOutras;

        let freteTotalComImposto = totalBruto;
        let valorImposto = 0;
        if (impostoFator < 1) {
            freteTotalComImposto = totalBruto / impostoFator;
            valorImposto = freteTotalComImposto - totalBruto;
        }

        const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
        const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
        const custoManut = kmGeral * manutKm;
        const totalCustos = custoCombustivel + custoArla + custoManut + pedagio;
        const lucro = totalBruto - totalCustos;

        const opt = { style: 'currency', currency: 'BRL' };
        document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
        document.getElementById("txt-km-rota-det").innerText = kmTotal.toFixed(1) + " km";
        document.getElementById("txt-km-total").innerText = kmGeral.toFixed(1) + " km";
        document.getElementById("txt-frete-base").innerText = freteBaseCarregado.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-deslocamento-fin").innerText = valorDeslocamentoFinal.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-imp").innerText = valorImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-frete-total").innerText = freteTotalComImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);
        document.getElementById("txt-km-real").innerText =
            (kmGeral > 0 ? (totalBruto / kmGeral) : 0).toLocaleString('pt-BR', opt);

    } catch (e) {
        console.error("Erro no cálculo:", e);
    }
}

// --- EVENT LISTENER ---
document.addEventListener("DOMContentLoaded", function() {
    const camposMoeda = [
        "valorPorKm",
        "valorDescarga",
        "valorOutrasDespesas",
        "custoDieselLitro",
        "custoArlaLitro",
        "custoPedagio",
        "custoManutencaoKm",
        "f-manut"
    ];

    camposMoeda.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function() {
                formatarMoeda(this);
                atualizarFinanceiro();
            });
        }
    });

    document.getElementById("imposto")?.addEventListener('change', atualizarFinanceiro);
    document.getElementById("tipoDeslocamento")?.addEventListener('change', atualizarFinanceiro);
    document.getElementById("tipoCarga")?.addEventListener('change', toggleAparelhoFrio);
});
