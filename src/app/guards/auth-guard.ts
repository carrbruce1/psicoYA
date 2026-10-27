import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../service/supabase.service'; 

export const authGuard: CanActivateFn = async (route, state) => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  // Consultamos la sesión a través de tu servicio de Supabase
  const session = await supabaseService.getSession();

  if (session) {
    return true; // Si hay sesión, dejamos pasar al admin
  } else {
    // Si no hay sesión, redirigimos al login
    return router.parseUrl('/login');
  }
};