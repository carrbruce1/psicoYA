import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegistroComponent } from './pages/registro/registro.component';
import { AdminPanelComponent } from './pages/admin-panel/admin-panel.component';
import { AuthService } from './guards/auth-guard';

export const routes: Routes = [

    {
        path: ' ',
        redirectTo: 'home',
        pathMatch: 'full',
    },

    {
        path: 'home',
        component: HomeComponent,
    },

    {
        path: 'login',
        component: LoginComponent,
    },

    {
        path:'registro',
        component: RegistroComponent,
    },

    {
        path: 'admin',
        component: AdminPanelComponent, 
    },

    {
        path: '**',
        redirectTo:'home',
    },
];
