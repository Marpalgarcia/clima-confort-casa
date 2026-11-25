# Controlar el Clima de Casa

Sistema de monitorización de temperatura y humedad con alertas de confort al móvil.
Diseñado para empezar en mi cuarto y escalar a toda la casa.

## Arquitectura del proyecto
- `sql/`: Esquema de base de datos en PostgreSQL (Supabase).
- `simulator/`: Simulador de lecturas y lógica de alertas con histéresis.
- `firmware/`: Código del microcontrolador y sensor físico.
- `pwa/`: Interfaz móvil (PWA) para consultar datos y recomendaciones.