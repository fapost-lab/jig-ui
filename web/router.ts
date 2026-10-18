import { createRouter, createWebHashHistory } from 'vue-router';
import BoardView from './views/BoardView.vue';
import TaskView from './views/TaskView.vue';
import WorkspaceView from './views/WorkspaceView.vue';

/** The page's addresses; `#/projects/<id>` and `#/projects/<id>/tasks/<task>` are the ones links already point at. */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: WorkspaceView },
    { path: '/projects/:id', component: BoardView, props: true },
    { path: '/projects/:id/tasks/:task', component: TaskView, props: (route) => ({ project: route.params.id, task: route.params.task }) },
    // The maintainer's page of every component; loaded only when opened, linked from nowhere.
    { path: '/canvas', component: () => import('./views/CanvasView.vue') },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});
