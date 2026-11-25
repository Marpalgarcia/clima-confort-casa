import os
import time
import requests

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://svixnqniosxgeutscpdk.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_4Yhu944PVPedd4DMVCbnKA_ar-mWD84")
NTFY_TOPIC = os.getenv("NTFY_TOPIC", "chalet-temp-alertas-9482")
ROOM_ID = os.getenv("ROOM_ID", "mi_cuarto")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def calcular_sensacion_termica(temp_c: float, humedad: float) -> float:
    """Calcula la sensación térmica (Índice de Calor en °C a partir de 20 °C y ajuste por humedad)."""
    if temp_c < 20.0:
        if temp_c < 16.0:
            return round(temp_c - (0.02 * (100.0 - humedad)), 2)
        return round(temp_c + (humedad - 50.0) * 0.015, 2)

    t_f = (temp_c * 9 / 5) + 32
    hi_f = 0.5 * (t_f + 61.0 + ((t_f - 68.0) * 1.2) + (humedad * 0.094))
    if hi_f >= 80:
        hi_f = (
            -42.379
            + 2.04901523 * t_f
            + 10.14333127 * humedad
            - 0.22475541 * t_f * humedad
            - 0.00683783 * (t_f**2)
            - 0.05481717 * (humedad**2)
            + 0.00122874 * (t_f**2) * humedad
            + 0.00085282 * t_f * (humedad**2)
            - 0.00000199 * (t_f**2) * (humedad**2)
        )
    return round((hi_f - 32) * 5 / 9, 2)


def enviar_alerta_movil(titulo: str, mensaje: str, prioridad: str = "default"):
    requests.post(
        f"https://ntfy.sh/{NTFY_TOPIC}",
        data=mensaje.encode("utf-8"),
        headers={
            "Title": titulo,
            "Priority": prioridad,
            "Tags": "thermometer",
        },
        timeout=10,
    )
    print(f"[NOTIFICACION ENVIADA] {titulo}: {mensaje}")


def procesar_lectura(temp: float, hum: float, hora_simulada: int):
    sensacion = calcular_sensacion_termica(temp, hum)

    requests.post(
        f"{SUPABASE_URL}/rest/v1/readings",
        headers=HEADERS,
        json={
            "room_id": ROOM_ID,
            "temperatura": temp,
            "humedad": hum,
            "sensacion_termica": sensacion,
        },
        timeout=10,
    )

    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/rooms?id=eq.{ROOM_ID}",
        headers=HEADERS,
        timeout=10,
    ).json()
    if not res:
        raise RuntimeError(f"No se encontró la habitación '{ROOM_ID}' en Supabase.")

    room = res[0]
    es_noche = hora_simulada >= 23 or hora_simulada <= 8
    u_calor = float(room["umbral_calor_noche"] if es_noche else room["umbral_calor_dia"])
    u_frio = float(room["umbral_frio_noche"] if es_noche else room["umbral_frio_dia"])
    hist = float(room["histeresis"])
    estado_actual = room["estado_alerta"]
    nuevo_estado = estado_actual

    print(
        f"[{hora_simulada:02d}:00] Temp: {temp}°C | Hum: {hum}% | "
        f"Sensación: {sensacion}°C | Estado: {estado_actual}"
    )

    if estado_actual == "NORMAL":
        if sensacion >= u_calor:
            nuevo_estado = "CALOR"
            msg = (
                f"Subida a {sensacion}°C en {room['nombre']} ({hum}% hum). Quítate ropa o destápate."
                if es_noche
                else f"Hace calor en {room['nombre']} ({sensacion}°C). Ventila o baja persianas."
            )
            enviar_alerta_movil("Aviso de Calor", msg, "high")
        elif sensacion <= u_frio:
            nuevo_estado = "FRIO"
            msg = (
                f"Bajada a {sensacion}°C en {room['nombre']}. Échate el edredón o abrígate."
                if es_noche
                else f"Empieza a hacer frío en {room['nombre']} ({sensacion}°C)."
            )
            enviar_alerta_movil("Aviso de Frío", msg, "default")

    elif estado_actual == "CALOR" and sensacion <= (u_calor - hist):
        nuevo_estado = "NORMAL"
        print(f"Temperatura estabilizada ({sensacion}°C). Rearmando sensor.")

    elif estado_actual == "FRIO" and sensacion >= (u_frio + hist):
        nuevo_estado = "NORMAL"
        print(f"Temperatura recuperada ({sensacion}°C). Rearmando sensor.")

    if nuevo_estado != estado_actual:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/rooms?id=eq.{ROOM_ID}",
            headers=HEADERS,
            json={"estado_alerta": nuevo_estado},
            timeout=10,
        )
        if nuevo_estado in ["CALOR", "FRIO"]:
            requests.post(
                f"{SUPABASE_URL}/rest/v1/alerts_log",
                headers=HEADERS,
                json={
                    "room_id": ROOM_ID,
                    "tipo_alerta": nuevo_estado,
                    "mensaje": f"Sensación de {sensacion}°C",
                },
                timeout=10,
            )


if __name__ == "__main__":
    escenario_noche = [
        (23, 19.5, 52),
        (0, 20.6, 58),
        (1, 21.4, 65),
        (2, 21.2, 64),
        (3, 20.1, 60),
        (5, 17.2, 55),
        (7, 16.5, 54),
    ]

    print("Iniciando simulación de lecturas...\n")
    for hora, t, h in escenario_noche:
        procesar_lectura(t, h, hora)
        time.sleep(3)