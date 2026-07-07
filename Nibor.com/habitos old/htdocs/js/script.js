const contenedor = document.getElementById("contenedor");
let cartas = document.querySelectorAll(".card");
let startX;

function actualizarCartas(totalHabitos = null) {
  const cartas = document.querySelectorAll(".card");
console.log('totalHabitos', totalHabitos);
  const count = totalHabitos !== null ? totalHabitos : cartas.length;
  // // Solo layout + bind de gestos
  cartas.forEach((carta, index) => {
    carta.style.zIndex = cartas.length - index;
    carta.style.transform = `translateY(${index * 12}px)`;
    agregarSwipe(carta);
  });
}


function agregarSwipe(carta) {
  if (carta.__swipeInit) return;   
  carta.__swipeInit = true;
  let startX;
  let isDragging = false;

  // 👆 TOUCH para móviles
  carta.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    document.body.style.overflow = 'hidden'; // ❌ Evita scroll general
  });

  carta.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].clientX;
    manejarSwipe(carta, endX - startX);
    document.body.style.overflow = ''; // ✅ Reactiva scroll al terminar
  });


  carta.addEventListener("touchmove", (e) => {
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - startX;
    carta.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 20}deg)`;
  });



  // 🖱 MOUSE para escritorio
  carta.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    carta.style.transition = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const currentX = e.clientX;
    const deltaX = currentX - startX;
    carta.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 20}deg)`;
  });

  document.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    const endX = e.clientX;
    manejarSwipe(carta, endX - startX);
  });
}





function toggleMenu() {
  document.getElementById("menu-list").classList.toggle("show");
}

// Cierra el menú si haces clic fuera
// escucha global para cerrar el menú si haces click fuera
window.addEventListener('click', (e) => {
  const menu = document.getElementById('menu-list');
  if (!menu) return;

  // si el click fue dentro del menú o en (o dentro de) un .menu-btn, no cerrar
  const clickedInsideMenu = menu.contains(e.target);
  const clickedOnButton = e.target.closest && e.target.closest('.menu-btn');
  if (!clickedInsideMenu && !clickedOnButton) menu.classList.remove('show');
});



function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.toggle("-translate-x-full");
  }
}

document.addEventListener("click", function (e) {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.querySelector("button[onclick='toggleSidebar()']");

  const isClickInsideSidebar = sidebar.contains(e.target);
  const isClickOnToggle = toggleBtn && toggleBtn.contains(e.target);

  // Si el sidebar está visible y haces clic fuera
  if (!sidebar.classList.contains("-translate-x-full") && !isClickInsideSidebar && !isClickOnToggle) {
    sidebar.classList.add("-translate-x-full");
  }
});

function mostrarSeccion(id) {
  document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.remove('hidden');
  // Oculta todas las secciones
  document.querySelectorAll("main > section").forEach(section => section.classList.add("hidden"));

  // Muestra la sección solicitada
  const seccionActiva = document.getElementById(id);
  if (seccionActiva) {
    seccionActiva.classList.remove("hidden");
  }

  // Mostrar u ocultar el botón de "volver al inicio"
  const volver = document.getElementById("volver-inicio");
  console.log('volver', volver)
  if (volver) {
    if (id === "seccion-principal") {
      volver.classList.add("hidden");

    } else {
      volver.classList.remove("hidden");
    }

  }

  // Ocultar sidebar (solo en móviles)
  const sidebar = document.getElementById("sidebar");
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.add("-translate-x-full");
  }

  if (id === 'seccion-habitos') {
  cargarMisHabitos();      // cada vez que entras, refresca la lista
}

if (id === 'seccion-proceso') {
    cargarProgreso();
  }

    cargarHabitosHoy()
      console.log('cargarHabitosHoy')

}


function abrirModal() {
  document.getElementById("modal-habito").classList.remove("hidden");

}

function cerrarModal() {
  document.getElementById("modal-habito").classList.add("hidden");
}


// <-- Seccion Editar Hábito -->
function activarSelectorDias(contenedor) {
  document.querySelectorAll(contenedor + ' .dia')
    .forEach(dia => {
      dia.addEventListener('click', () => {
        console.log(`Día : ${dia.textContent.trim()}`);
        // Si está seleccionado, lo “deseleccionamos”
        if (dia.classList.contains('bg-primary')) {
          console.log(`Deseleccionando día: ${dia.textContent.trim()}`);
          dia.classList.remove('bg-primary', 'text-white', 'border-primary');
          // dia.classList.add('bg-transparent', 'text-gray-800', 'border-gray-300');
        } else {
          // Si no, lo “seleccionamos”
          dia.classList.remove('bg-transparent', 'text-gray-800', 'border-gray-300');
          dia.classList.add('bg-primary', 'text-white', 'border-primary');
        }
      });
    });
}

document.addEventListener('DOMContentLoaded', () => {
  activarSelectorDias('#dias-container');
  activarSelectorDias('#dias-container-editar');
});




// <-- Seccion Editar Hábito -->




let habitoActual = '';

function abrirModalEditar(nombre) {
  habitoActual = nombre;
  document.getElementById("modal-editar").classList.remove("hidden");
  document.getElementById("input-habito").value = nombre;
}



function guardarEdicionHabito() {
  const nuevoNombre = document.getElementById("input-habito").value;
  alert(`Guardar cambio: ${habitoActual} ➜ ${nuevoNombre}`);
  cerrarModalEditar();
  // Aquí puedes enviar por fetch() si quieres guardar
}

function eliminarHabitoDesdeModal() {
  alert(`Eliminar hábito: ${habitoActual}`);
  cerrarModalEditar();
  // Aquí también podrías usar fetch() a un PHP
}

function cambiarTema() {
  const html = document.documentElement;
  const btn = document.getElementById('toggle-theme');

  html.classList.toggle('dark');

  if (html.classList.contains('dark')) {
    btn.textContent = '☀️'; // Modo oscuro activo → mostrar sol
  } else {
    btn.textContent = '🌙'; // Modo claro activo → mostrar luna
  }
}

// Detectar la hora local y aplicar tema oscuro automáticamente si es de noche
document.addEventListener("DOMContentLoaded", () => {
  const hora = new Date().getHours();
  const html = document.documentElement;
  const btn = document.getElementById('toggle-theme');

  if (hora >= 19 || hora < 6) {
    html.classList.add('dark');
    btn.textContent = '☀️';
  } else {
    html.classList.remove('dark');
    btn.textContent = '🌙';
  }
});

function lanzarConfetti() {
  confetti({
    particleCount: 150,
    spread: 80,
    origin: { y: 0.6 }
  });
}

// Detectar si se muestra el mensaje de completado y lanzar confetti
function verificarYCelebrar() {
  const mensaje = document.getElementById("mensaje-completado");
  if (mensaje && !mensaje.classList.contains("hidden")) {
    lanzarConfetti();
  }
}




// Abre el modal al hacer click en un hábito de "Mis Hábitos"
document.addEventListener('DOMContentLoaded', () => {
  const lista = document.getElementById('lista-organizable');
  if (!lista) return;

  lista.addEventListener('click', (e) => {
    // si el click fue en el "≡" (drag handle), no abrimos el modal
    if (e.target.closest('.drag-handle')) return;

    const item = e.target.closest('.habit-item');
    if (!item) return;

    const habitId = item.dataset.habitId;
    if (habitId) abrirModalEditarPorId(habitId); // ← ya la implementamos
  });
});


async function marcarEvento(habitId) {
  const fd = new FormData();
  console.log('habitId', habitId);
  fd.append('habit_id', habitId);
  const res = await fetch('php/api/mark_event.php', {
    method: 'POST',
    body: fd,
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || 'Error marcando');
  return json; // { ok, met, done_today, target }
}


const letraADia = { D:0, L:1, M:2, X:3, J:4, V:5, S:6 };
const diaALetra = ['D','L','M','X','J','V','S'];

let habitoEditId = null;

function resetDiasEditar() {
  document.querySelectorAll('#dias-container-editar .dia').forEach(d => {
    d.classList.remove('bg-primary','text-white','border-primary');
  });
}
function marcarDiasEditar(diasNum/*array 0..6*/) {
  resetDiasEditar();
  diasNum.forEach(n => {
    const letra = diaALetra[n];
    const el = document.querySelector(`#dias-container-editar .dia[data-dia="${letra}"]`);
    if (el) el.classList.add('bg-primary','text-white','border-primary');
  });
}

async function abrirModalEditarPorId(habitId) {
  habitoEditId = habitId;
  try {
    const fd = new FormData(); fd.append('habit_id', habitId);
    const res = await fetch('php/api/habits_detail.php', { method:'POST', body:fd, headers:{'X-Requested-With':'XMLHttpRequest'} });
    const j = await res.json();
    if (!j.ok) throw new Error(j.message||'Error');

    document.getElementById('input-habito').value = j.habit.name;
    document.getElementById('input-frecuencia').value = j.habit.target_per_day;
    marcarDiasEditar(j.days || []);

    document.getElementById('modal-editar').classList.remove('hidden');
  } catch (e) {
    alert('No se pudo cargar el hábito.');
  }
}
function cerrarModalEditar(){ document.getElementById('modal-editar').classList.add('hidden'); }


function diasSeleccionadosEditar() {
  return [...document.querySelectorAll('#dias-container-editar .dia.bg-primary')]
    .map(el => letraADia[el.dataset.dia])
    .filter(x => x !== undefined);
}

async function guardarEdicionHabito() {
  if (!habitoEditId) return;
  const nombre = document.getElementById('input-habito').value.trim();
  const target = parseInt(document.getElementById('input-frecuencia').value, 10) || 1;
  const dias   = diasSeleccionadosEditar();

  const fd = new FormData();
  fd.append('habit_id', habitoEditId);
  fd.append('name', nombre);
  fd.append('target_per_day', target);
  dias.forEach(d => fd.append('days[]', d));

  try {
    const res = await fetch('php/api/habits_update.php', { method:'POST', body:fd, headers:{'X-Requested-With':'XMLHttpRequest'} });
    const j = await res.json();
    if (!j.ok) throw new Error(j.message||'Error');

    cerrarModalEditar();
    // refresca ambas vistas
    if (typeof cargarMisHabitos === 'function') await cargarMisHabitos();
    if (typeof cargarHabitosHoy === 'function')   await cargarHabitosHoy();
  } catch (e) {
    alert('No se pudo guardar los cambios.');
  }
}

async function eliminarHabitoDesdeModal() {
  if (!habitoEditId) return;
  if (!confirm('¿Eliminar este hábito? Esta acción no se puede deshacer.')) return;

  const fd = new FormData(); fd.append('habit_id', habitoEditId);
  try {
    const res = await fetch('php/api/habits_delete.php', { method:'POST', body:fd, headers:{'X-Requested-With':'XMLHttpRequest'} });
    const j = await res.json();
    if (!j.ok) throw new Error(j.message||'Error');

    cerrarModalEditar();
    if (typeof cargarMisHabitos === 'function') await cargarMisHabitos();
    if (typeof cargarHabitosHoy === 'function')   await cargarHabitosHoy();
  } catch (e) {
    alert('No se pudo eliminar el hábito.');
  }
}



// ----- Frases aleatorias cada 1 min (solo si #seccion-principal está visible) -----
let FRASES = [];
let fraseTimer = null;
let lastIdx = -1;

async function initFrases() {
  try {
    // sin cache para ver cambios sin refrescar duro
    const res = await fetch('js/frases.json', { cache: 'no-store' });
    FRASES = await res.json();
    // arranca si estamos en la home
    startFrasesTicker();
  } catch (e) {
    console.error('Error cargando frases.json', e);
  }
}

function seccionPrincipalVisible() {
  const home = document.getElementById('seccion-principal');
  return home && !home.classList.contains('hidden') && !document.hidden && FRASES.length > 0;
}

function ponerFrase(texto) {
  const el = document.getElementById('frase-inspiradora');
  if (!el) return;
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = `“${texto}”`;
    el.style.opacity = 1;
  }, 150);
}

function ponerFraseAleatoria() {
  if (!seccionPrincipalVisible()) return;
  let i;
  do {
    i = Math.floor(Math.random() * FRASES.length);
  } while (FRASES.length > 1 && i === lastIdx);
  lastIdx = i;
  ponerFrase(FRASES[i]);
}

function startFrasesTicker() {
  if (!seccionPrincipalVisible()) return;
  ponerFraseAleatoria(); // muestra una al entrar
  if (fraseTimer) clearInterval(fraseTimer);
  fraseTimer = setInterval(ponerFraseAleatoria, 60_000); // 1 min
}

function stopFrasesTicker() {
  if (fraseTimer) { clearInterval(fraseTimer); fraseTimer = null; }
}

// Inicia cuando cargue el DOM
document.addEventListener('DOMContentLoaded', initFrases);

// Pausa/reanuda cuando cambie la visibilidad de la pestaña
document.addEventListener('visibilitychange', () => {
  if (seccionPrincipalVisible()) startFrasesTicker(); else stopFrasesTicker();
});

// Si ya tienes mostrarSeccion, engánchate para pausar/reanudar al cambiar de sección
const _mostrarSeccionOriginal = window.mostrarSeccion;
window.mostrarSeccion = function(id) {
  if (typeof _mostrarSeccionOriginal === 'function') _mostrarSeccionOriginal(id);
  if (id === 'seccion-principal') startFrasesTicker(); else stopFrasesTicker();
};







