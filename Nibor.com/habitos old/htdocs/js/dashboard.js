async function cargarHabitosHoy() {
  const cont = document.getElementById('contenedor');
  if (!cont) return;

  cont.innerHTML = '<p class="text-center text-gray-500">Cargando...</p>';

  try {
    const res = await fetch('php/api/habits_today.php', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const json = await res.json();
    console.log('ids (hoy):', (json.habits || []).map(h => h.id));

    if (!json.ok) throw new Error(json.message || 'Error cargando hábitos');

    const habits = json.habits || [];
    console.log('habits', habits)
    cont.innerHTML = '';

    // si no hay hábitos pendientes, muestra el mensaje de completado
    if (habits.length === 0) {
      cont.innerHTML = '';
      const m = document.getElementById('mensaje-completado');
      if (m) m.classList.remove('hidden');

      // Solo si estoy en la vista principal
      if (document.querySelector('#seccion-principal:not(.hidden)')) {
        verificarYCelebrar();
      }
      return;
    } else {
      const m = document.getElementById('mensaje-completado');
      if (m) m.classList.add('hidden');
    }


    habits.forEach((h) => {
      const done = Number(h.done_today || 0);
      const target = Math.max(1, Number(h.target_per_day || 1));

      const card = document.createElement('div');
      card.className = 'card absolute inset-0 bg-violeta rounded-2xl shadow-lg translate-y-[0px] z-10 flex items-center justify-center text-xl font-bold text-gray-700 max-w-[100vw] dark:text-gray-100';
      card.dataset.habitId = h.id;

      card.innerHTML = `
        ${h.emoji || ''} ${h.name}
        <div class="absolute top-2 left-4 text-sm font-medium">
  
        </div>
        <div class="absolute bottom-2 right-4 text-sm font-medium">
          <span data-role="ratio">${done} / ${target}</span>
        </div>
      `;

      cont.appendChild(card);
    });

    // re-apila tus cartas como ya lo haces
    actualizarCartas(habits.length);



  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p class="text-center text-red-600">Error cargando hábitos.</p>';
  }
}

// Llama esto al cargar el dashboard:
document.addEventListener('DOMContentLoaded', cargarHabitosHoy);

function manejarSwipe(carta, deltaX) {
  const habitId = carta.dataset.habitId; // <- viene de la tarjeta creada arriba

  if (deltaX > 100) {
    // Swipe derecha → completar (insert en habit_events)
    carta.style.transition = "transform 0.5s ease";
    carta.style.transform = "translateX(500px)";
    enviarSwipe("derecha", habitId);  // <- pasa habitId
    setTimeout(() => {
      carta.remove();
      actualizarCartas();

      // Si quieres refrescar desde BD (por si cambió el conteo), descomenta:
      cargarHabitosHoy();
    }, 300);

  } else if (deltaX < -100) {
    // Swipe izquierda → mover al final (no pan data-role="done">${done}</span> hoy nada en BD)
    carta.style.transition = "transform 0.5s ease";
    carta.style.transform = "translateX(-500px)";
    enviarSwipe("izquierda", habitId); // <- por si quieres loguear el reorden
    setTimeout(() => {
      carta.style.transition = "none";
      carta.style.transform = "none";
      carta.remove();
      setTimeout(() => {
        contenedor.appendChild(carta);
        actualizarCartas();
      }, 10);
    }, 300);

  } else {
    carta.style.transition = "transform 0.3s ease";
    carta.style.transform = "translateX(0) rotate(0deg)";
  }
}
async function enviarSwipe(direccion, habitId) {
  if (!habitId) return { ok: false, message: 'habitId vacío' };

  if (direccion === 'derecha') {
    const fd = new FormData();
    fd.append('habit_id', habitId);

    const res = await fetch('php/api/mark_event.php', {
      method: 'POST',
      body: fd,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    });
    const json = await res.json();
    // json esperado: { ok:true, met:boolean, done_today:n, target:n }

    // 👉 si NO llegó a la meta, posponemos para mandarla al final “del día”
    if (json.ok && !json.met) {
      const defer = await posponerHabit(habitId); // { ok:true, defer_rank:n }
      return { ...json, deferred: defer.ok === true };
    }
    return json; // ok + met o error
  }

  if (direccion === 'izquierda') {
    const defer = await posponerHabit(habitId); // { ok:true, defer_rank:n }
    return { ok: defer.ok, deferred: defer.ok === true, defer_rank: defer.defer_rank };
  }

  return { ok: false, message: 'Dirección inválida' };
}



async function posponerHabit(habitId) {
  const fd = new FormData();
  fd.append('habit_id', habitId);
  const res = await fetch('php/api/defer_habit.php', {
    method: 'POST',
    body: fd,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'same-origin'
  });
  const text = await res.text();
  console.log('defer_habit raw:', text);   // <-- ver exacto
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Respuesta no JSON'); }
  if (!json.ok) throw new Error(json.message || 'Error al posponer');
  return json;
}


async function cargarMisHabitos() {
  const ul = document.getElementById('lista-organizable');
  if (!ul) return;

  ul.innerHTML = '<li class="text-center text-sm text-gray-400">Cargando…</li>';

  try {
    const res = await fetch('php/api/habits_list.php', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || 'Error listando hábitos');

    ul.innerHTML = '';
    (json.habits || []).forEach(h => {
      const li = document.createElement('li');
      li.className = 'habit-item bg-violeta text-white rounded-lg p-4 flex justify-between items-center cursor-grab';
      li.dataset.habitId = h.id;             // ⬅️ NECESARIO
      li.innerHTML = `
  <span>${h.emoji || ''} ${h.name}</span>
  <span class="drag-handle text-xl cursor-grab">≡</span>
`;
      ul.appendChild(li);
    });

    initSortableHabitos(); // activa drag & drop una vez
  } catch (e) {
    console.error(e);
    ul.innerHTML = '<li class="text-center text-sm text-red-500">No se pudieron cargar tus hábitos.</li>';
  }
}

function initSortableHabitos() {
  const ul = document.getElementById('lista-organizable');
  if (!ul) return;
  if (ul.__sortableInit) return;       // evita doble init
  ul.__sortableInit = true;

  new Sortable(ul, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'opacity-60',
    onEnd: guardarOrden
  });
}

async function guardarOrden(evt) {
  const ul = evt.to;
  const ids = [...ul.querySelectorAll('li[data-habit-id]')].map(li => Number(li.dataset.habitId));


  console.log('ids', ids)

  try {
    const res = await fetch('php/api/habits_reorder.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ order: ids }),
      credentials: 'same-origin'
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || 'No se pudo guardar el orden');
    // opcional: console.log('Orden actualizado');
  } catch (e) {
    console.error(e);
    alert('Error guardando el nuevo orden');
  }
}

///////////////////////////////////////

// Mapea letra a número (0=Dom,1=Lun,...6=Sáb)
const mapDiaALNumero = (letra) => {
  const m = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };
  return m[letra] ?? null;
};

async function guardarNuevoHabito() {
  const nombre = document.getElementById('nombre-habito').value.trim();
  const target = parseInt(document.getElementById('frecuencia-habito').value, 10) || 1;

  // Días seleccionados desde #dias-container (usa tu misma clase 'bg-primary' del selector)
  const diasSel = [...document.querySelectorAll('#dias-container .dia.bg-primary')]
    .map(el => mapDiaALNumero(el.dataset.dia))
    .filter(d => d !== null);

  if (!nombre) {
    alert('Escribe un nombre para el hábito');
    return;
  }

  const fd = new FormData();
  fd.append('name', nombre);
  fd.append('target_per_day', target);
  // Puedes permitir que el usuario elija emoji/color luego; por ahora defaults:
  // fd.append('emoji', '');
  // fd.append('color', '#b7b2e7');
  diasSel.forEach(d => fd.append('days[]', d));

  try {
    const res = await fetch('php/api/habits_create.php', {
      method: 'POST',
      body: fd,
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || 'Error');

    // Limpia y cierra modal
    document.getElementById('nombre-habito').value = '';
    document.getElementById('frecuencia-habito').value = 1;
    document.querySelectorAll('#dias-container .dia.bg-primary')
      .forEach(d => d.classList.remove('bg-primary', 'text-white', 'border-primary'));
    cerrarModal();

    // Refresca vistas
    // 1) tablero principal
    if (typeof cargarHabitosHoy === 'function') {
      await cargarHabitosHoy();
    }
    // 2) lista “Mis Hábitos” (si tienes la función que los pinta)
    if (typeof cargarMisHabitos === 'function') {
      await cargarMisHabitos();
    }

    // feedback
    console.log('Creado:', json.habit);

  } catch (err) {
    console.error(err);
    alert('No se pudo crear el hábito.');
  }
}



function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function colorHeatmap(cell) {
  if (!cell.planned) return 'bg-gray-100 dark:bg-gray-700/40';
  if (cell.met)     return 'bg-primary';
  if (cell.done > 0) return 'bg-primary/40';
  return 'bg-gray-200 dark:bg-gray-600/60';
}

function renderHeatmap(heatmap) {
  return heatmap.map(c => {
    const cls = colorHeatmap(c);
    const tip = `${c.date} — ${c.done} ${c.done === 1 ? 'vez' : 'veces'}${c.planned ? '' : ' (no programado)'}`;
    return `<div class="w-3.5 h-3.5 rounded-sm ${cls}" title="${tip}"></div>`;
  }).join('');
}

function renderResumen(s) {
  const pct = s.percent_today;
  const pctColor = pct >= 100 ? 'text-green-600' : pct >= 60 ? 'text-primary' : 'text-gray-600 dark:text-gray-300';
  return `
    <div class="bg-white dark:bg-gray-700 rounded-2xl shadow-sm border dark:border-gray-600 p-5 grid grid-cols-3 gap-3 text-center">
      <div>
        <p class="text-2xl font-bold ${pctColor}">${s.done_today}<span class="text-base text-gray-400">/${s.planned_today || 0}</span></p>
        <p class="text-xs text-gray-500 dark:text-gray-300 mt-1">Hoy</p>
      </div>
      <div class="border-x dark:border-gray-600">
        <p class="text-2xl font-bold text-primary">${s.total_habits}</p>
        <p class="text-xs text-gray-500 dark:text-gray-300 mt-1">Hábitos</p>
      </div>
      <div>
        <p class="text-2xl font-bold text-orange-500">🔥 ${s.best_current_streak}</p>
        <p class="text-xs text-gray-500 dark:text-gray-300 mt-1">Mejor racha</p>
      </div>
    </div>
  `;
}

function renderTarjetaHabito(h) {
  const semanal = h.weekly || { events: 0, planned: 0, percent: 0 };
  const pctSem = semanal.percent || 0;
  const rachaActual = h.streak_current || 0;
  const rachaMax = h.streak_longest || 0;
  const heatmapHTML = renderHeatmap(h.heatmap || []);

  const chip = (titulo, data) => `
    <div class="flex-1 min-w-[90px] bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
      <p class="text-xs text-gray-500 dark:text-gray-300">${titulo}</p>
      <p class="font-semibold text-primary text-base">${data.percent || 0}%</p>
      <p class="text-[10px] text-gray-400">${data.events || 0} de ${data.planned || 0}</p>
    </div>
  `;

  return `
    <div class="bg-white dark:bg-gray-700 rounded-2xl shadow-sm border dark:border-gray-600 p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate">
          ${escapeHTML(h.emoji || '')} ${escapeHTML(h.name)}
        </h3>
        <div class="flex items-center gap-1 text-orange-500 font-semibold text-sm whitespace-nowrap"
             title="Mejor racha: ${rachaMax} días">
          🔥 ${rachaActual} <span class="text-xs text-gray-400 font-normal">días</span>
        </div>
      </div>

      <div class="mb-3">
        <div class="flex justify-between text-xs text-gray-500 dark:text-gray-300 mb-1">
          <span>Esta semana</span>
          <span class="font-semibold">${pctSem}%</span>
        </div>
        <div class="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div class="h-full bg-primary transition-all" style="width: ${Math.min(100, pctSem)}%"></div>
        </div>
        <p class="text-[11px] text-gray-400 mt-1">${semanal.events} de ${semanal.planned} marcas</p>
      </div>

      <div class="mb-3">
        <div class="flex justify-between text-xs text-gray-500 dark:text-gray-300 mb-1">
          <span>Últimos 30 días</span>
          <span class="text-[11px] text-gray-400">← antes · hoy →</span>
        </div>
        <div class="flex flex-wrap gap-1">
          ${heatmapHTML}
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        ${chip('Mes', h.monthly)}
        ${chip('Trimestre', h.quarterly)}
        ${chip('Semestre', h.semiannual)}
        ${chip('Año', h.annual)}
      </div>
    </div>
  `;
}

async function cargarProgreso() {
  const resumen = document.getElementById('resumen-progreso');
  const lista = document.getElementById('lista-progreso');
  if (!lista || !resumen) return;

  resumen.innerHTML = '';
  lista.innerHTML = '<div class="text-center text-gray-500">Cargando…</div>';

  try {
    const res = await fetch('php/api/summary_counts.php', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || 'Error');

    const items = json.items || [];

    if (json.summary) resumen.innerHTML = renderResumen(json.summary);

    if (items.length === 0) {
      lista.innerHTML = '<div class="text-center text-gray-400 py-6">Aún no tienes hábitos activos.</div>';
      return;
    }

    lista.innerHTML = items.map(renderTarjetaHabito).join('');
  } catch (e) {
    console.error(e);
    lista.innerHTML = '<div class="text-center text-red-500">No se pudo cargar el progreso.</div>';
  }
}


