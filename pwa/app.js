const DEFAULT_SUPABASE_URL = "https://svixnqniosxgeutscpdk.supabase.co";
const DEFAULT_SUPABASE_KEY = "";

const els = {
  roomSelect: document.getElementById("roomSelect"),
  refreshBtn: document.getElementById("refreshBtn"),
  heroCard: document.getElementById("heroCard"),
  statusBadge: document.getElementById("statusBadge"),
  lastUpdate: document.getElementById("lastUpdate"),
  tempValue: document.getElementById("tempValue"),
  humValue: document.getElementById("humValue"),
  feelsValue: document.getElementById("feelsValue"),
  comfortSummary: document.getElementById("comfortSummary"),
  modeTag: document.getElementById("modeTag"),
  recommendationText: document.getElementById("recommendationText"),
  chartLine: document.getElementById("chartLine"),
  chartEmpty: document.getElementById("chartEmpty"),
  minTempLabel: document.getElementById("minTempLabel"),
  maxTempLabel: document.getElementById("maxTempLabel"),
  alertsList: document.getElementById("alertsList"),
  cfgUrl: document.getElementById("cfgUrl"),
  cfgKey: document.getElementById("cfgKey"),
  saveCfgBtn: document.getElementById("saveCfgBtn"),
  configDetails: document.getElementById("configDetails"),
};

function getConfig() {
  const url = localStorage.getItem("ccc_supabase_url") || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem("ccc_supabase_key") || DEFAULT_SUPABASE_KEY;
  return { url: url.replace(/\/+$/, ""), key };
}

function saveConfig() {
  const url = els.cfgUrl.value.trim();
  const key = els.cfgKey.value.trim();
  if (!url || !key) {
    alert("Introduce la Project URL y la Publishable Key de Supabase.");
    return;
  }
  localStorage.setItem("ccc_supabase_url", url);
  localStorage.setItem("ccc_supabase_key", key);
  els.configDetails.open = false;
  initDashboard();
}

function headersFor(key) {
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
  };
  if (key && key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function esHorarioNoche(dateObj = new Date()) {
  const h = dateObj.getHours();
  return h >= 23 || h <= 8;
}

function formatearHora(isoString) {
  if (!isoString) return "--:--";
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function generarRecomendacion(room, readings) {
  const esNoche = esHorarioNoche();
  els.modeTag.textContent = esNoche ? "MODO NOCHE" : "MODO DÍA";

  if (!readings || readings.length === 0) {
    return "Sin lecturas todavía. En cuanto lleguen datos del simulador o del sensor te daré recomendaciones según la tendencia.";
  }

  const ultima = readings[readings.length - 1];
  const sensacionActual = Number(ultima.sensacion_termica);
  const uCalor = Number(esNoche ? room.umbral_calor_noche : room.umbral_calor_dia);
  const uFrio = Number(esNoche ? room.umbral_frio_noche : room.umbral_frio_dia);

  let tendencia = 0;
  if (readings.length >= 3) {
    const previa = Number(readings[readings.length - 3].sensacion_termica);
    tendencia = Number((sensacionActual - previa).toFixed(2));
  }

  if (sensacionActual >= uCalor) {
    return esNoche
      ? `Sensación alta (${sensacionActual.toFixed(1)} °C, por encima de ${uCalor} °C). Conviene quitar capa o destaparte para no pasar calor.`
      : `Temperatura elevada (${sensacionActual.toFixed(1)} °C). Buena idea ventilar o bajar persianas si entra sol directo.`;
  }

  if (sensacionActual <= uFrio) {
    return esNoche
      ? `Sensación fresca (${sensacionActual.toFixed(1)} °C, por debajo de ${uFrio} °C). Te compensa echarte el edredón o abrigarte.`
      : `Ambiente fresco (${sensacionActual.toFixed(1)} °C). Si vas en manga corta, convendrá abrigarse o climatizar.`;
  }

  if (esNoche && tendencia >= 0.4) {
    return `La sensación térmica está subiendo (+${tendencia.toFixed(1)} °C en las últimas lecturas). Si duermes con la puerta cerrada, vigila si te sobra ropa.`;
  }

  if (esNoche && tendencia <= -0.5) {
    return `Se nota tendencia a la baja (${tendencia.toFixed(1)} °C). Deja el edredón a mano por si refresca más de madrugada.`;
  }

  const tipoRango = esNoche ? "nocturno" : "diurno";
    return `Confort estable (${sensacionActual.toFixed(1)} °C). Rango ${tipoRango} de referencia entre ${uFrio} °C y ${uCalor} °C.`;
}

function renderChart(readings) {
  if (!readings || readings.length < 2) {
    els.chartLine.setAttribute("points", "");
    els.chartEmpty.style.display = "block";
    els.minTempLabel.textContent = "Mín: --.- °C";
    els.maxTempLabel.textContent = "Máx: --.- °C";
    return;
  }

  els.chartEmpty.style.display = "none";
  const values = readings.map((r) => Number(r.sensacion_termica));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = Math.max(maxVal - minVal, 0.5);

  const width = 360;
  const padY = 16;
  const height = 130 - padY * 2;

  const points = values
    .map((val, idx) => {
      const x = (idx / (values.length - 1)) * width;
      const norm = (val - minVal) / span;
      const y = padY + height - norm * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  els.chartLine.setAttribute("points", points);
  els.minTempLabel.textContent = `Mín: ${minVal.toFixed(1)} °C`;
  els.maxTempLabel.textContent = `Máx: ${maxVal.toFixed(1)} °C`;
}

function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    els.alertsList.innerHTML = `<li class="empty-state">Sin alertas registradas todavía.</li>`;
    return;
  }

  els.alertsList.innerHTML = alerts
    .map((a) => {
      const tipo = a.tipo_alerta === "CALOR" ? "Calor" : a.tipo_alerta === "FRIO" ? "Frío" : a.tipo_alerta;
      return `
        <li class="alert-item">
          <div>
            <strong>${tipo}:</strong> ${a.mensaje}
          </div>
          <span class="alert-meta">${formatearHora(a.created_at)}</span>
        </li>
      `;
    })
    .join("");
}

async function cargarHabitaciones(cfg) {
  const res = await fetch(`${cfg.url}/rest/v1/rooms?select=*&order=nombre.asc`, {
    headers: headersFor(cfg.key),
  });
  if (!res.ok) throw new Error(`Error cargando estancias (${res.status})`);
  const rooms = await res.json();

  const currentSelection = els.roomSelect.value || localStorage.getItem("ccc_room_id") || "mi_cuarto";
  els.roomSelect.innerHTML = rooms
    .map((r) => `<option value="${r.id}">${r.nombre}</option>`)
    .join("");

  if (rooms.some((r) => r.id === currentSelection)) {
    els.roomSelect.value = currentSelection;
  } else if (rooms.length > 0) {
    els.roomSelect.value = rooms[0].id;
  }

  return rooms.find((r) => r.id === els.roomSelect.value) || rooms[0];
}

async function cargarDatosEstancia(cfg, room) {
  if (!room) return;
  localStorage.setItem("ccc_room_id", room.id);

  const [readingsRes, alertsRes] = await Promise.all([
    fetch(
      `${cfg.url}/rest/v1/readings?room_id=eq.${encodeURIComponent(room.id)}&order=created_at.desc&limit=20`,
      { headers: headersFor(cfg.key) }
    ),
    fetch(
      `${cfg.url}/rest/v1/alerts_log?room_id=eq.${encodeURIComponent(room.id)}&order=created_at.desc&limit=6`,
      { headers: headersFor(cfg.key) }
    ),
  ]);

  const readingsDesc = readingsRes.ok ? await readingsRes.json() : [];
  const alerts = alertsRes.ok ? await alertsRes.json() : [];
  const readings = [...readingsDesc].reverse();

  const estado = room.estado_alerta || "NORMAL";
  els.statusBadge.textContent = estado;
  els.statusBadge.className = `badge badge-${estado.toLowerCase()}`;
  els.heroCard.className = `hero-card state-${estado.toLowerCase()}`;

  if (readings.length > 0) {
    const ultima = readings[readings.length - 1];
    els.tempValue.textContent = Number(ultima.temperatura).toFixed(1);
    els.humValue.textContent = `${Math.round(Number(ultima.humedad))}%`;
    els.feelsValue.textContent = `${Number(ultima.sensacion_termica).toFixed(1)} °C`;
    els.lastUpdate.textContent = `Act. ${formatearHora(ultima.created_at)}`;
    els.comfortSummary.textContent = `Lectura registrada en ${room.nombre} con humedad del ${Number(ultima.humedad).toFixed(0)}%.`;
  } else {
    els.tempValue.textContent = "--.-";
    els.humValue.textContent = "--%";
    els.feelsValue.textContent = "--.- °C";
    els.lastUpdate.textContent = "--:--";
    els.comfortSummary.textContent = `Aún no hay lecturas guardadas para ${room.nombre}.`;
  }

  els.recommendationText.textContent = generarRecomendacion(room, readings);
  renderChart(readings);
  renderAlerts(alerts);
}

async function initDashboard() {
  const cfg = getConfig();
  els.cfgUrl.value = cfg.url;
  els.cfgKey.value = cfg.key;

  if (!cfg.url || !cfg.key) {
    els.configDetails.open = true;
    els.comfortSummary.textContent =
      "Abre 'Conexión con Supabase' abajo, pega tu Project URL y tu Publishable Key y pulsa Guardar.";
    return;
  }

  try {
    const room = await cargarHabitaciones(cfg);
    await cargarDatosEstancia(cfg, room);
  } catch (err) {
    els.comfortSummary.textContent = `No se pudo conectar con Supabase: ${err.message}`;
  }
}

els.saveCfgBtn.addEventListener("click", saveConfig);
els.refreshBtn.addEventListener("click", initDashboard);
els.roomSelect.addEventListener("change", initDashboard);

initDashboard();