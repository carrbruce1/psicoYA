import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly tiempoMaximo = 12000;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  get client() {
    return this.supabase;
  }

  private async conTiempoMaximo<T>(operacion: PromiseLike<T>): Promise<T> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(operacion),
        new Promise<never>((_, reject) => {
          temporizador = setTimeout(
            () => reject(new Error('La solicitud tardó demasiado. Revisá tu conexión e intentá nuevamente.')),
            this.tiempoMaximo
          );
        })
      ]);
    } finally {
      if (temporizador !== undefined) clearTimeout(temporizador);
    }
  }

  async getSession(): Promise<Session | null> {
    try {
      const resultado = await this.conTiempoMaximo(this.supabase.auth.getSession());
      return resultado.data.session;
    } catch (error) {
      console.error('Error al obtener la sesión:', error);
      return null;
    }
  }

  async signIn(email: string, password: string) {
    try {
      const resultado = await this.conTiempoMaximo(
        this.supabase.auth.signInWithPassword({ email: email.trim(), password })
      );
      return { data: resultado.data, error: resultado.error };
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message || 'No se pudo conectar con el servicio.' }
      };
    }
  }

  // El perfil de la tabla 'psicologos' lo crea la base de datos (trigger de registro.sql)
  // a partir de estos datos, así funciona aunque el correo todavía no esté confirmado.
  async signUp(email: string, password: string, nombreCompleto: string, matricula: string) {
    try {
      const { data, error } = await this.conTiempoMaximo(
        this.supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { nombre_completo: nombreCompleto.trim(), matricula: matricula.trim() },
            emailRedirectTo: `${window.location.origin}/login`
          }
        })
      );
      if (error) return { data, error };
      if (data.user && data.user.identities?.length === 0) {
        return { data, error: { message: 'User already registered' } };
      }
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message || 'No se pudo completar el registro.' } };
    }
  }

  async signOut() {
    try {
      return await this.conTiempoMaximo(this.supabase.auth.signOut());
    } catch (error: any) {
      return { error: { message: error.message || 'No se pudo cerrar la sesión.' } };
    }
  }
}