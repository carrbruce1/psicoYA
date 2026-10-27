import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly tiempoMaximo = 12000;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  get client() {
    return this.supabase;
  }

  private async conTiempoMaximo<T>(
    operacion: PromiseLike<T>
  ): Promise<T> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        Promise.resolve(operacion),
        new Promise<never>((_, reject) => {
          temporizador = setTimeout(() => {
            reject(
              new Error(
                'La solicitud tardó demasiado. Revisá tu conexión e intentá nuevamente.'
              )
            );
          }, this.tiempoMaximo);
        })
      ]);
    } finally {
      if (temporizador !== undefined) {
        clearTimeout(temporizador);
      }
    }
  }

  // Obtener la sesión actual para el Guard
  async getSession(): Promise<Session | null> {
    try {
      const resultado = await this.conTiempoMaximo(
        this.supabase.auth.getSession()
      );
      return resultado.data.session;
    } catch (error) {
      console.error('Error al obtener la sesión:', error);
      return null;
    }
  }

  // Iniciar sesión
  async signIn(email: string, password: string) {
    try {
      const resultado = await this.conTiempoMaximo(
        this.supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        })
      );
      return {
        data: resultado.data,
        error: resultado.error
      };
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message || 'No se pudo conectar con el servicio.' }
      };
    }
  }

  // Registrar usuario y crear perfil profesional
  async signUp(
    email: string,
    password: string,
    nombreCompleto: string,
    matricula: string
  ) {
    try {
      const resultado = await this.conTiempoMaximo(
        this.supabase.auth.signUp({
          email: email.trim(),
          password
        })
      );

      const { data, error } = resultado;

      if (error || !data.user) {
        return { data, error };
      }

      // Crear perfil en la tabla 'psicologos'
      const resultadoPerfil = await this.conTiempoMaximo(
        this.supabase
          .from('psicologos')
          .insert({
            id: data.user.id,
            nombre_completo: nombreCompleto.trim(),
            matricula: matricula.trim(),
            email: email.trim(),
            activo: true
          })
      );

      if (resultadoPerfil.error) {
        return {
          data,
          error: {
            message: 'La cuenta se creó, pero no se pudo guardar el perfil profesional.'
          }
        };
      }

      return { data, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message || 'No se pudo completar el registro.' }
      };
    }
  }

  // Cerrar sesión
  async signOut() {
    try {
      return await this.conTiempoMaximo(this.supabase.auth.signOut());
    } catch (error: any) {
      return { error: { message: error.message || 'No se pudo cerrar la sesión.' } };
    }
  }
}