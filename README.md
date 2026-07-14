# 🕹️ CCNA Mock Exam

Simulador de examen **CCNA 200-301** con estética pixel art. Python (Flask) se encarga de
seleccionar y barajar las preguntas, calificar, guardar el historial de puntajes y generar
el análisis de resultados; el navegador solo pinta el juego.

## Características

- **Banco de 100 preguntas esenciales** distribuidas según los pesos del blueprint oficial:
  Fundamentos de Red (20), Acceso a la Red (20), Conectividad IP (25), Servicios IP (10),
  Seguridad (15) y Automatización (10).
- **Exámenes que varían**: cada intento toma una muestra aleatoria (10 / 25 / 50 / 100
  preguntas) y además baraja el orden de las opciones.
- **Puntaje estilo Cisco**: escala 0–1000 con corte de aprobación en 825.
- **Temporizador** proporcional (90 s por pregunta) con envío automático al agotarse.
- **Análisis al finalizar**: desglose por dominio y revisión pregunta por pregunta con la
  respuesta correcta y su explicación (filtrable por correctas/falladas).
- **Registro de puntajes** persistente en `scores.json` con tabla de high scores.
- **Diseño pixel art**: CRT scanlines, confetti pixelado al aprobar, animaciones amigables
  y atajos de teclado (A–D para responder, ← → para navegar).

## Cómo ejecutarlo

```bash
pip install -r requirements.txt
python app.py
```

Luego abre <http://127.0.0.1:5000> en tu navegador y pulsa **PRESS START**.

## Estructura

```
app.py              # servidor Flask: sesiones de examen, calificación, historial
questions.py        # banco de 100 preguntas (dominio, opciones, correcta, explicación)
templates/index.html
static/style.css    # tema pixel art
static/game.js      # navegación del examen y render de resultados
scores.json         # historial de intentos (se crea automáticamente)
```
