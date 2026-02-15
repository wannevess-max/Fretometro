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
        zoom: 4,
        center: centroBR,
        disableDefaultUI: false
    });

    directionsRenderer.setMap(map);
    setupAutocomplete();
    restaurarPosicaoPaineis();
}

function setupAutocomplete() {
    const inputs = ["origem", "destino", "saida"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const autocomplete = new google.maps.places.Autocomplete(el);
            autocomplete.addListener('place_changed', () => {
                calcularRota();
            });
            // Adiciona gatilho ao perder o foco também
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
            origin: pontoVazio,
            destination: origem,
            travelMode: 'DRIVING'
        }, (res, status) => {
            if (status === 'OK') {
                distVazioMetros = res.routes[0].legs[0].distance.value;
            } else {
                distVazioMetros = 0;
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

// --- CÁLCULOS FINANCEIROS ---
function parseMoeda(valor) {
    if (!valor || valor === "") return 0;
    // Remove R$, pontos de milhar e espaços
    let limpo = valor.toString().replace(/R\$\s?/, "").replace(/\./g, "").replace(/\s/g, "");
    // Troca a vírgula por ponto para o JS reconhecer como número
    limpo = limpo.replace(",", ".");
    return parseFloat(limpo) || 0;
}
function formatarMoeda(input) {
    let valor = input.value.replace(/\D/g, ""); // Remove tudo que não é número
    if (valor === "") {
        input.value = "";
        return;
    }
    // Transforma em decimal (ex: 123 vira 1.23)
    valor = (parseFloat(valor) / 100).toFixed(2);
    // Formata para o padrão brasileiro
    input.value = "R$ " + valor.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}
function atualizarFinanceiro() {
    if (!rotaIniciada) return;

    try {
        // --- 1. DISTÂNCIAS ---
        const kmTotal = (distRotaMetros / 1000);
        const kmVazio = (distVazioMetros / 1000);
        const kmGeral = kmTotal + kmVazio;

        // --- 2. LEITURA DE INPUTS (USANDO OS NOVOS PARSE/FORMAT) ---
        const dieselL = parseMoeda(document.getElementById("custoDieselLitro").value);
        const consumoM = parseFloat(document.getElementById("consumoDieselMedia").value) || 0;
        const arlaL  = parseMoeda(document.getElementById("custoArlaLitro").value);
        const arlaP  = (parseFloat(document.getElementById("arlaPorcentagem").value) || 0) / 100;
        const pedagio = parseMoeda(document.getElementById("custoPedagio").value);
        const manutKm = parseMoeda(document.getElementById("custoManutencaoKm").value);
        const freteKmInput = parseMoeda(document.getElementById("valorPorKm").value);
        
        const vDescarga = parseMoeda(document.getElementById("valorDescarga").value);
        const vOutras = parseMoeda(document.getElementById("valorOutrasDespesas").value);
        const impostoFator = parseFloat(document.getElementById("imposto").value) || 0;

        // --- 3. CÁLCULO DO DESLOCAMENTO (CORRIGIDO) ---
        let valorDeslocamentoFinal = 0;
        const tipoDesloc = document.getElementById("tipoDeslocamento").value;
        if (tipoDesloc === "remunerado_km") {
            const vKmDesloc = parseMoeda(document.getElementById("valorDeslocamentoKm").value);
            valorDeslocamentoFinal = kmVazio * vKmDesloc;
        } else if (tipoDesloc === "remunerado_rs") {
            valorDeslocamentoFinal = parseMoeda(document.getElementById("valorDeslocamentoTotal").value);
        }

        // --- 4. RECEITA BRUTA E IMPOSTO (MATEMÁTICA DE FRETE) ---
        const freteBase = freteKmInput * kmTotal;
        const baseCalculoSemImposto = freteBase + valorDeslocamentoFinal + vDescarga + vOutras;
        
        let freteTotal, valorImposto;

        if (impostoFator > 0 && impostoFator < 1) {
            // Cálculo "Por Dentro": Base / 0.88 (para 12%)
            freteTotal = baseCalculoSemImposto / impostoFator;
            valorImposto = freteTotal - baseCalculoSemImposto;
        } else {
            // Sem imposto ou fator inválido
            freteTotal = baseCalculoSemImposto;
            valorImposto = 0;
        }

        // --- 5. CUSTOS OPERACIONAIS ---
        const custoCombustivel = consumoM > 0 ? (kmGeral / consumoM) * dieselL : 0;
        const custoArla = consumoM > 0 ? ((kmGeral / consumoM) * arlaP) * arlaL : 0;
        const custoManut = kmGeral * manutKm;
        
        let custoFrio = 0;
        if(document.getElementById("tipoCarga").value === "frigorifica") {
            const consH = parseFloat(document.getElementById("consumoFrioHora").value) || 0;
            custoFrio = consH * dieselL * 5; // Estimativa de 5h ou ajuste conforme necessário
        }

        const totalCustosOperacionais = custoCombustivel + custoArla + custoManut + pedagio + custoFrio;
        
        // Lucro é o que sobra do Frete Total após pagar o Imposto e os Custos
        const lucro = freteTotal - valorImposto - totalCustosOperacionais;

        // --- 6. ATUALIZAR UI ---
        const opt = { style: 'currency', currency: 'BRL' };
        
        document.getElementById("txt-km-total").innerText = kmGeral.toFixed(1) + " km";
        document.getElementById("txt-km-vazio-det").innerText = kmVazio.toFixed(1) + " km";
        document.getElementById("txt-km-rota-det").innerText = kmTotal.toFixed(1) + " km";
        
        // Valor real por KM (Receita Líquida / KM Total)
        document.getElementById("txt-km-real").innerText = (kmTotal > 0 ? (baseCalculoSemImposto / kmTotal) : 0).toLocaleString('pt-BR', opt);

        document.getElementById("txt-frete-base").innerText = freteBase.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-deslocamento-fin").innerText = valorDeslocamentoFinal.toLocaleString('pt-BR', opt);
        document.getElementById("txt-valor-imp").innerText = valorImposto.toLocaleString('pt-BR', opt);
        document.getElementById("txt-frete-total").innerText = freteTotal.toLocaleString('pt-BR', opt);
        
        if(document.getElementById("txt-an-diesel")) {
            document.getElementById("txt-an-diesel").innerText = custoCombustivel.toLocaleString('pt-BR', opt);
            document.getElementById("txt-an-arla").innerText = custoArla.toLocaleString('pt-BR', opt);
            document.getElementById("txt-an-pedagio").innerText = pedagio.toLocaleString('pt-BR', opt);
            document.getElementById("txt-an-manut").innerText = custoManut.toLocaleString('pt-BR', opt);
            document.getElementById("txt-total-custos").innerText = totalCustosOperacionais.toLocaleString('pt-BR', opt);
            document.getElementById("txt-lucro-real").innerText = lucro.toLocaleString('pt-BR', opt);
        }

        // Barras Visuais
        const pVazio = kmGeral > 0 ? (kmVazio / kmGeral) * 100 : 0;
        document.getElementById("visual-vazio").style.width = pVazio + "%";
        document.getElementById("visual-rota").style.width = (100 - pVazio) + "%";
        document.getElementById("perc-vazio").innerText = pVazio.toFixed(0) + "%";
        document.getElementById("perc-rota").innerText = (100 - pVazio).toFixed(0) + "%";

    } catch (e) {
        console.error("Erro no cálculo financeiro:", e);
    }
}

// --- INTERFACE E EVENTOS ---
document.addEventListener("DOMContentLoaded", function() {
    // A. Formatação Dinâmica (1 = 0,01)
    const camposMoeda = ["valorDeslocamentoKm", "valorDeslocamentoTotal", "valorPorKm", "valorDescarga", "valorOutrasDespesas", "custoDieselLitro", "custoArlaLitro", "custoPedagio", "custoManutencaoKm"];
    
    camposMoeda.forEach(id => {
        document.getElementById(id)?.addEventListener('input', function() {
            formatarMoeda(this); 
        });
    });

    // B. Monitor de Inputs para Recalcular
    const inputsFinanceiros = [...camposMoeda, "consumoDieselMedia", "arlaPorcentagem", "consumoFrioHora"];
    inputsFinanceiros.forEach(id => {
        document.getElementById(id)?.addEventListener('input', atualizarFinanceiro);
    });

    // C. Gatilhos de Seleção
    document.getElementById("imposto")?.addEventListener('change', atualizarFinanceiro);
    document.getElementById("tipoCarga")?.addEventListener('change', function() {
        toggleAparelhoFrio();
        atualizarFinanceiro();
    });

    // D. Lógica de Deslocamento
    const selectDesloc = document.getElementById("tipoDeslocamento");
    selectDesloc?.addEventListener('change', function() {
        document.getElementById("valorDeslocamentoKm").style.display = (this.value === "remunerado_km") ? "block" : "none";
        document.getElementById("valorDeslocamentoTotal").style.display = (this.value === "remunerado_rs") ? "block" : "none";
        atualizarFinanceiro();
    });

    // E. Campo de Saída
    const campoSaida = document.getElementById("saida");
    campoSaida?.addEventListener('input', function() {
        const container = document.getElementById("container-config-deslocamento");
        if(this.value.trim() !== "") {
            container.style.display = "flex";
        } else {
            container.style.display = "none";
            if(selectDesloc) selectDesloc.value = "nao_remunerado";
            atualizarFinanceiro();
        }
    });
});

function toggleCustos() {
    document.body.classList.toggle('custos-open');
    const isOpen = document.body.classList.contains('custos-open');
    localStorage.setItem('keep_custos', isOpen);
    if (isOpen) carregarSelectFrota();
    setTimeout(() => { if(map) google.maps.event.trigger(map, 'resize'); }, 300);
}

function toggleFrota() { 
    const painel = document.getElementById('painel-frota');
    painel.classList.toggle('active');
    renderFrota();
}

function toggleGoogleMaps() {
    const painel = document.getElementById('painel-roteiro-escrito');
    painel.classList.toggle('active');
    localStorage.setItem('keep_roteiro', painel.classList.contains('active'));
}

function restaurarPosicaoPaineis() {
    if (localStorage.getItem('keep_roteiro') === 'true') document.getElementById('painel-roteiro-escrito')?.classList.add('active');
    if (localStorage.getItem('keep_custos') === 'true') {
        document.body.classList.add('custos-open');
        carregarSelectFrota();
    }
}

function toggleAparelhoFrio() {
    const tipo = document.getElementById("tipoCarga").value;
    const isFrio = tipo === "frigorifica";
    document.getElementById("container-frio-input").style.display = isFrio ? "block" : "none";
    document.getElementById("row-an-frio").style.display = isFrio ? "flex" : "none";
    document.getElementById("container-frio-datas").style.display = isFrio ? "block" : "none";
    atualizarFinanceiro();
}

function adicionarParada() {
    const container = document.getElementById("lista-pontos");
    const li = document.createElement("li");
    li.className = "ponto-item sortable-item";
    li.innerHTML = `
        <span class="handle">☰</span>
        <input type="text" class="parada-input" placeholder="Parada intermediária..." autocomplete="off">
        <button onclick="this.parentElement.remove(); calcularRota();" style="background:none; border:none; color:red; cursor:pointer;">×</button>
    `;
    container.insertBefore(li, document.getElementById("li-destino"));
    const autocomplete = new google.maps.places.Autocomplete(li.querySelector("input"));
    autocomplete.addListener('place_changed', calcularRota);
}

// --- GESTÃO DE FROTA ---
function salvarVeiculo() {
    const nome = document.getElementById("f-nome").value;
    if(!nome) return;
    const v = {
        id: Date.now(),
        nome: nome,
        media: document.getElementById("f-consumo").value,
        manut: document.getElementById("f-manut").value
    };
    frota.push(v);
    localStorage.setItem('frota_db', JSON.stringify(frota));
    renderFrota();
}

function renderFrota() {
    const list = document.getElementById("lista-v-render");
    if(!list) return;
    list.innerHTML = frota.map(v => `
        <div class="veiculo-card">
            <div><strong>${v.nome}</strong></div>
            <button onclick="selecionarVeiculo(${v.id})">Selecionar</button>
            <button onclick="excluirVeiculo(${v.id})" style="background:red; color:white;">×</button>
        </div>
    `).join('');
}

function selecionarVeiculo(id) {
    const v = frota.find(x => x.id === id);
    if(v) {
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

function carregarSelectFrota() {
    const sel = document.getElementById('selFrotaVinculo');
    if(!sel) return;
    sel.innerHTML = '<option value="">-- Selecione --</option>' + 
        frota.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
}

function vincularFrota(elem) {
    selecionarVeiculo(parseInt(elem.value));
}

function processarSegmentosRota(res) {
    const leg = res.routes[0].legs[0];
    const listaEscrita = document.getElementById("lista-passo-a-passo");
    listaEscrita.innerHTML = `<div style="padding:10px;"><strong>Origem:</strong> ${leg.start_address}<br><strong>Destino:</strong> ${leg.end_address}</div>`;
    atualizarFinanceiro();
}



