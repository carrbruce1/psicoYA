
import { Injectable } from '@angular/core';
import {
  createClient,
  SupabaseClient
} from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;

  private readonly tiempoMaximo = 12000;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  /**
   * Evita que la interfaz quede esperando indefinidamente.
   * Acepta promesas y consultas de Supabase.
   */
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

  /**
   * Iniciar sesión.
   */
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
    } catch (error: unknown) {
      console.error('Error al iniciar sesión:', error);

      return {
        data: {
          user: null,
          session: null
        },
        error: {
          message: this.mensajeError(
            error,
            'No se pudo conectar con el servicio de autenticación.'
          )
        }
      };
    }
  }

  /**
   * Registrar usuario y crear su perfil profesional.
   */
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

      // Crear el perfil vinculado al usuario de Supabase Auth.
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

      const profileError = resultadoPerfil.error;

      if (profileError) {
        console.error(
          'Error al crear el perfil profesional:',
          profileError
        );

        return {
          data,
          error: {
            message:
              'La cuenta se creó, pero no se pudo guardar el perfil profesional. Revisá los permisos de Supabase o contactá al administrador.'
          }
        };
      }

      return {
        data,
        error: null
      };
    } catch (error: unknown) {
      console.error('Error al registrarse:', error);

      return {
        data: null,
        error: {
          message: this.mensajeError(
            error,
            'No se pudo completar el registro.'
          )
        }
      };
    }
  }

  /**
   * Obtener la sesión actual.
   */
  async getSession() {
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

  /**
   * Cerrar sesión.
   */
  async signOut() {
    try {
      return await this.conTiempoMaximo(
        this.supabase.auth.signOut()
      );
    } catch (error: unknown) {
      console.error('Error al cerrar sesión:', error);

      return {
        error: {
          message: this.mensajeError(
            error,
            'No se pudo cerrar la sesión.'
          )
        }
      };
    }
  }

  /**
   * Convertir errores desconocidos en mensajes legibles.
   */
  private mensajeError(
    error: unknown,
    mensajePredeterminado: string
  ): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }

    return mensajePredeterminado;
  }
}
