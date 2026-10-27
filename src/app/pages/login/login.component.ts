import { Component, signal } from '@angular/core';
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
  // La app no usa zone.js: estos estados viven en signals para que la pantalla se
  // actualice sola después de cada await. En el HTML se usan igual que antes.
  private readonly _isLoginMode = signal(true);
  private readonly _errorMessage = signal('');
  private readonly _successMessage = signal('');
  private readonly _loading = signal(false);

  get isLoginMode() { return this._isLoginMode(); }
  set isLoginMode(v: boolean) { this._isLoginMode.set(v); }
  get errorMessage() { return this._errorMessage(); }
  set errorMessage(v: string) { this._errorMessage.set(v); }
  get successMessage() { return this._successMessage(); }
  set successMessage(v: string) { this._successMessage.set(v); }
  get loading() { return this._loading(); }
  set loading(v: boolean) { this._loading.set(v); }

  email = '';
  password = '';
  nombre = '';
  matricula = '';

  constructor(private supabaseService: SupabaseService, private router: Router) {}

  async onSubmit(): Promise<void> {
    if (this.loading) return;
    this.errorMessage = '';
    this.successMessage = '';
    const email = this.email.trim();

    if (!email || !this.password) {
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
        const { error } = await this.supabaseService.signIn(email, this.password);
        if (error) {
          this.errorMessage = this.obtenerMensajeLogin(error.message);
          return;
        }
        await this.router.navigate(['/admin']);
      } else {
        const { data, error } = await this.supabaseService.signUp(email, this.password, this.nombre.trim(), this.matricula.trim());
        if (error) {
          console.error('Error al registrarse:', error);
          this.errorMessage = this.obtenerMensajeRegistro(error.message);
          return;
        }
        if (data?.session) {
          await this.router.navigate(['/admin']);
          return;
        }
        this.isLoginMode = true;
        this.password = '';
        this.nombre = '';
        this.matricula = '';
        this.successMessage = `¡Cuenta creada! Te enviamos un correo a ${email}. Confirmalo para activar tu cuenta y después iniciá sesión.`;
      }
    } catch (error: unknown) {
      console.error('Error inesperado en autenticación:', error);
      this.errorMessage = 'No se pudo conectar con el sistema. Revisá tu conexión e intentá nuevamente.';
    } finally {
      this.loading = false;
    }
  }

  private obtenerMensajeLogin(mensaje?: string): string {
    const texto = (mensaje || '').toLowerCase();
    if (texto.includes('email not confirmed')) return 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada y la carpeta de spam.';
    if (texto.includes('rate limit') || texto.includes('too many')) return 'Se realizaron demasiados intentos. Esperá un momento y volvé a probar.';
    if (texto.includes('tardó demasiado') || texto.includes('network') || texto.includes('fetch') || texto.includes('conectar')) return mensaje || 'No se pudo conectar con el sistema.';
    return 'El correo electrónico o la contraseña son incorrectos.';
  }

  private obtenerMensajeRegistro(mensaje?: string): string {
    const texto = (mensaje || '').toLowerCase();
    if (texto.includes('already registered')) return 'Este correo ya está registrado. Probá iniciar sesión.';
    if (texto.includes('password')) return 'La contraseña no cumple con los requisitos.';
    if (texto.includes('rate limit')) return 'Se realizaron demasiados intentos. Esperá un momento y volvé a probar.';
    return mensaje || 'No se pudo completar el registro. Intentá nuevamente.';
  }

  toggleMode(): void {
    if (this.loading) return;
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.successMessage = '';
    this.password = '';
  }
}