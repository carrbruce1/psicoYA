import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../service/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  isLoginMode = true;

  email = '';
  password = '';
  nombre = '';
  matricula = '';

  errorMessage = '';
  loading = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async onSubmit(): Promise<void> {
    if (this.loading) return;

    this.errorMessage = '';

    const emailIngresado = this.email.trim();

    if (!emailIngresado || !this.password) {
      this.errorMessage = 'Completá el correo y la contraseña.';
      return;
    }

    if (!this.isLoginMode) {
      if (!this.nombre.trim() || !this.matricula.trim()) {
        this.errorMessage = 'Completá tu nombre y matrícula profesional.';
        return;
      }

      if (this.password.length < 6) {
        this.errorMessage = 'La contraseña debe tener al menos 6 caracteres.';
        return;
      }
    }

    this.loading = true;

    try {
      if (this.isLoginMode) {
        const { error } = await this.supabaseService.signIn(
          emailIngresado,
          this.password
        );

        if (error) {
          console.log('Supabase devolvió el error de credenciales');

          this.errorMessage =
            'El correo electrónico o la contraseña son incorrectos.';

          this.loading = false;

          return;
        }

        await this.router.navigate(['/admin']);

      } else {
        const { error } = await this.supabaseService.signUp(
          emailIngresado,
          this.password,
          this.nombre.trim(),
          this.matricula.trim()
        );

        if (error) {
          console.error('Error al registrarse:', error);

          this.errorMessage = this.obtenerMensajeRegistro(error.message);
          return;
        }

        alert(
          '¡Registro exitoso! Revisá tu correo electrónico para confirmar tu cuenta.'
        );

        this.isLoginMode = true;
        this.password = '';
      }
    } catch (error: any) {
      console.error('Error inesperado en autenticación:', error);

      this.errorMessage =
        'No se pudo conectar con el sistema. Revisá tu conexión e intentá nuevamente.';
    } finally {
      this.loading = false;
    }
  }

  private obtenerMensajeRegistro(mensaje?: string): string {
    const texto = (mensaje || '').toLowerCase();

    if (texto.includes('already registered')) {
      return 'Este correo ya está registrado. Probá iniciar sesión.';
    }

    if (texto.includes('password')) {
      return 'La contraseña no cumple con los requisitos.';
    }

    if (
      texto.includes('email rate limit') ||
      texto.includes('rate limit')
    ) {
      return 'Se realizaron demasiados intentos. Esperá un momento y volvé a probar.';
    }

    return mensaje || 'No se pudo completar el registro. Intentá nuevamente.';
  }

  toggleMode(): void {
    if (this.loading) return;

    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.password = '';
  }
}