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
        zoom: 4, center: centroBR
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
}

// --- AUTOCOMPLETE ---
function setupAutocomplete() {
    ["origem", "destino", "saida"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const ac = new google.maps.places.Autocomplete(el);
            ac.addListener('place_changed', calcularRota);
            el.addEventListener('blur', calcularRota);
        }
    });
}

// --- ROTAS ---
function calcularRota() {
    const origem = document.getElementById("origem").value;
    const destino = document.getElementById("destino").value;
    const saida = document.getElementById("saida").value;
    if (!origem || !destino) return;

    rotaIniciada = true;

    if (saida) {
        directionsService.route({
            origin: saida,
            destination: origem,
            travelMode: 'DRIVING'
        }, (res, status) => {
            distVazioMetros = status === 'OK' ? res.routes[0].legs[0].distance.value : 0;
            executarRotaPrincipal(origem, destino);
        });
    } else {
        distVazioMetros = 0;
        executarRotaPrincipal(origem, destino);
    }
}

function executarRotaPrincipal(origem, destino) {
    directionsService.route({
        origin: origem,
        destination: destino,
        travelMode: 'DRIVING'
    }, (res, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(res);
            distRotaMetros = res.routes[0].legs.reduce((a, l) => a + l.distance.value, 0);
            atualizarFinanceiro();
        }
    });
}

// --- MOEDA (CORREÇÃO CIRÚRGICA AQUI) ---
function formatarMoeda(input) {
    if (!input || typeof input.value !== "string") return;

    let valor = input.value.replace(/\D/g, "");

    if (valor === "") valor = "0";

    valor = (parseInt(valor, 10) / 100).toFixed(2);

    input.value = "R$ " + valor
        .replace(".", ",")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseMoeda(v) {
    if (!v) return 0;
    return parseFloat(v.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
}

// --- FINANCEIRO ---
function atualizarFinanceiro() {
    if (!rotaIniciada) return;

    const kmVazio = distVazioMetros / 1000;
    const kmRota = distRotaMetros / 1000;

    const tipo = document.getElementById("tipoDeslocamento").value;
    let deslocamento = 0;

    if (tipo === "remunerado_km") {
        deslocamento = kmVazio * parseMoeda(
            document.getElementById("inputValorDeslocamentoKm").value
        );
    }

    if (tipo === "remunerado_rs") {
        deslocamento = parseMoeda(
            document.getElementById("inputValorDeslocamentoTotal").value
        );
    }

    document.getElementById("txt-valor-deslocamento-fin").innerText =
        deslocamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// --- EVENTOS ---
document.addEventListener("DOMContentLoaded", () => {

    const camposMoeda = [
        "valorPorKm",
        "valorDescarga",
        "valorOutrasDespesas",
        "custoDieselLitro",
        "custoArlaLitro",
        "custoPedagio",
        "custoManutencaoKm"
    ];

    camposMoeda.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", function () {
                formatarMoeda(this);
                atualizarFinanceiro();
            });
        }
    });


        });
    }

    document.getElementById("tipoDeslocamento")
        ?.addEventListener("change", atualizarFinanceiro);
});

