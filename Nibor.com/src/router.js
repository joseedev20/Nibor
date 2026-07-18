import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: 'Resumen' } },
  { path: '/notificaciones', name: 'notificaciones', component: () => import('./views/NotificacionesView.vue'), meta: { title: 'Notificaciones' } },
  { path: '/musica', name: 'musica', component: () => import('./views/MusicaView.vue'), meta: { title: 'Música' } },
  { path: '/conocimiento', name: 'conocimiento', component: () => import('./views/ConocimientoView.vue'), meta: { title: 'Conocimiento' } },
  { path: '/habitos', name: 'habitos', component: () => import('./views/HabitosView.vue'), meta: { title: 'Hábitos' } },
  { path: '/eventos', name: 'eventos', component: () => import('./views/EventosView.vue'), meta: { title: 'Eventos' } },
  { path: '/recordatorios', name: 'recordatorios', component: () => import('./views/RecordatoriosView.vue'), meta: { title: 'Recordatorios' } },
  { path: '/salud', name: 'salud', component: () => import('./views/SaludView.vue'), meta: { title: 'Salud' } },
  { path: '/inversiones', name: 'inversiones', component: () => import('./views/InversionesView.vue'), meta: { title: 'Inversiones' } },
  { path: '/metas', name: 'metas', component: () => import('./views/MetasView.vue'), meta: { title: 'Metas' } },
  { path: '/prestamos', name: 'prestamos', component: () => import('./views/PrestamosView.vue'), meta: { title: 'Préstamos' } },
  { path: '/vehiculos', name: 'vehiculos', component: () => import('./views/VehiculosView.vue'), meta: { title: 'Vehículos' } },
  { path: '/familiar', name: 'familiar', component: () => import('./views/FamiliarView.vue'), meta: { title: 'Familiar' } },
  { path: '/casa', name: 'casa', component: () => import('./views/CasaView.vue'), meta: { title: 'Casa' } },
  { path: '/bansky', name: 'bansky', component: () => import('./views/BanskyView.vue'), meta: { title: 'Bansky' } },
  { path: '/gastos', name: 'gastos', component: () => import('./views/GastosView.vue'), meta: { title: 'Gastos e Ingresos' } },
  { path: '/suscripciones', name: 'suscripciones', component: () => import('./views/SuscripcionesView.vue'), meta: { title: 'Suscripciones' } },
  { path: '/cierre', name: 'cierre', component: () => import('./views/CierreView.vue'), meta: { title: 'Cierre de mes' } },
  { path: '/config', name: 'config', component: () => import('./views/ConfigView.vue'), meta: { title: 'Configuración' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Página no encontrada' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  document.title = `${to.meta.title} - Nibor`
})

export default router
