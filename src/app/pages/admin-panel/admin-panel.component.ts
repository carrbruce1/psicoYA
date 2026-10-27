import { Component, HostListener, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../guards/auth-guard';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

type Vista = 'dashboard' | 'pacientes' | 'agenda' | 'documentos' | 'pagos';
type Modal = null | 'paciente' | 'turno' | 'documento' | 'pago' | 'estadoPaciente';
type EstadoTurno = 'pendiente' | 'confirmado' | 'realizado' | 'cancelado';
type EstadoPago = 'pendiente' | 'confirmado' | 'no pagado';

interface Paciente { id: string; nombre: string; apellido: string; dni?: string; telefono?: string; edad?: number; escolaridad?: string; es_menor?: boolean; tutor_nombre?: string; modalidad_pago?: string; obra_social?: string; estado?: string; fecha_nacimiento?: string; }
interface Turno { id: string; paciente_id: string; fecha_hora_inicio: string; fecha_hora_final: string; estado: string; observaciones?: string | null; nombre_paciente_turno?: string | null; }
interface Documento { id: string; paciente_id: string; titulo: string; tipo: string; archivo_url: { path: string; nombre: string; mime?: string } | null; }
interface Pago { id: string; paciente_id: string; monto: number; estado: EstadoPago; concepto?: string; metodo_pago?: string; fecha_pago?: string | null; }

const clave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mayus = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css']
})
export class AdminPanelComponent implements OnInit {
  private supabase: SupabaseClient;
  private readonly hoy = new Date();
  private porDia = new Map<string, Turno[]>();

  readonly menu: { id: Vista; label: string; icono: string }[] = [
    { id: 'dashboard', label: 'Resumen', icono: '▦' },
    { id: 'pacientes', label: 'Pacientes', icono: '♙' },
    { id: 'agenda', label: 'Agenda', icono: '▣' },
    { id: 'documentos', label: 'Documentos', icono: '▤' },
    { id: 'pagos', label: 'Cobros y pagos', icono: '$' }
  ];
  readonly titulos: Record<Vista, string> = { dashboard: 'Dashboard', pacientes: 'Pacientes', agenda: 'Agenda', documentos: 'Documentos', pagos: 'Cobros y pagos' };
  readonly acciones: Record<Vista, { label: string; modal: Exclude<Modal, null> }> = {
    dashboard: { label: 'Nuevo paciente', modal: 'paciente' },
    pacientes: { label: 'Nuevo paciente', modal: 'paciente' },
    agenda: { label: 'Nuevo turno', modal: 'turno' },
    documentos: { label: 'Subir documento', modal: 'documento' },
    pagos: { label: 'Registrar cobro', modal: 'pago' }
  };
  readonly tituloModal: Record<Exclude<Modal, null>, string> = {
    paciente: 'Registrar nuevo paciente', turno: 'Nuevo turno', documento: 'Subir documento',
    pago: 'Registrar cobro', estadoPaciente: 'Actualizar estado del paciente'
  };
  readonly semana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  readonly estadosTurno: EstadoTurno[] = ['pendiente', 'confirmado', 'realizado', 'cancelado'];
  readonly accionTurno: Record<EstadoTurno, string> = {
    pendiente: 'Volver a pendiente', confirmado: 'Confirmar', realizado: 'Marcar realizado', cancelado: 'Cancelar turno'
  };

  guardando = false;
  loggingOut = false;
  error = '';
  searchTerm = '';
  searchDocumentos = '';
  searchPagos = '';
  filtroEstado = 'todos';
  vistaActual: Vista = 'dashboard';
  modal: Modal = null;

  psicologoNombre = 'Cargando...';
  psicologoIniciales = '';
  userId = '';

  pacientes: Paciente[] = [];
  documentos: Documento[] = [];
  pagos: Pago[] = [];
  turnos: Turno[] = [];
  turnosHoy: Turno[] = [];
  pacientesActivos = 0;
  informesCargados = 0;
  pagosPendientesCount = 0;

  mes = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), 1);
  diaSel = new Date();
  turnoSel: Turno | null = null;
  diasMes: Date[] = [];

  nuevoPaciente: any = {};
  nuevoTurno: any = {};
  nuevoDoc: any = {};
  nuevoPago: any = {};
  archivo: File | null = null;
  pacienteEstado: Paciente | null = null;
  estadoPacienteNuevo = 'En tratamiento';

  constructor(private authService: AuthService, private router: Router, private cdr: ChangeDetectorRef) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async ngOnInit() {
    try {
      this.armarDias();
      await this.cargarPerfilPsicologo();
      await this.cargarDatosCompletos();
    } catch (e) {
      console.error('Error al iniciar el panel:', e);
    }
    this.cdr.detectChanges();
  }

  async cargarPerfilPsicologo() {
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error) console.error('No se pudo obtener la sesión:', error);
    if (!user) { this.psicologoNombre = 'Profesional'; this.psicologoIniciales = 'P'; return; }
    this.userId = user.id;
    const { data, error: perfilError } = await this.supabase.from('psicologos').select('nombre_completo').eq('id', user.id).maybeSingle();
    if (perfilError) console.error('Error al cargar el perfil:', perfilError);
    const nombre = data?.nombre_completo || user.email || 'Profesional';
    this.psicologoNombre = nombre;
    this.psicologoIniciales = nombre.trim().split(/\s+/).map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  async cargarDatosCompletos() {
    if (!this.userId) return console.error('No hay un profesional autenticado.');
    const db = this.supabase, uid = this.userId;
    const [pac, inf, pag] = await Promise.all([
      db.from('pacientes').select('*').eq('psicologo_id', uid).order('apellido'),
      db.from('informes').select('*').eq('psicologo_id', uid),
      db.from('pagos').select('*').eq('psicologo_id', uid)
    ]);
    if (pac.error) console.error('Error al cargar pacientes:', pac.error);
    if (inf.error) console.error('Error al cargar informes:', inf.error);
    if (pag.error) console.error('Error al cargar pagos:', pag.error);
    this.pacientes = (pac.data ?? []) as Paciente[];
    this.documentos = (inf.data ?? []) as Documento[];
    this.pagos = (pag.data ?? []) as Pago[];
    this.recalcular();
    await Promise.all([this.cargarTurnos(), this.cargarHoy()]);
    this.cdr.detectChanges();
  }

  recalcular() {
    this.pacientesActivos = this.pacientes.filter(p => p.estado === 'En tratamiento').length;
    this.informesCargados = this.documentos.length;
    this.pagosPendientesCount = this.pagos.filter(p => p.estado === 'pendiente').length;
  }

  cambiarSeccion(v: Vista) { this.vistaActual = v; }
  accionPrincipal() { this.abrir(this.acciones[this.vistaActual].modal); }

  @HostListener('document:keydown.escape')
  onEsc() { this.cerrar(); }

  get pacientesFiltrados() {
    const q = this.searchTerm.trim().toLowerCase();
    return this.pacientes.filter(p =>
      `${p.nombre} ${p.apellido} ${p.dni ?? ''} ${p.obra_social ?? ''} ${p.modalidad_pago ?? ''}`.toLowerCase().includes(q) &&
      (this.filtroEstado === 'todos' || p.estado === this.filtroEstado));
  }

  get documentosFiltrados(): Documento[] {
    const q = this.searchDocumentos.trim().toLowerCase();
    return q
      ? this.documentos.filter(d => [this.nombreDe(d.paciente_id), d.titulo ?? '', d.tipo ?? '', d.archivo_url?.nombre ?? ''].join(' ').toLowerCase().includes(q))
      : this.documentos;
  }

  get pagosFiltrados(): Pago[] {
    const q = this.searchPagos.trim().toLowerCase();
    return q
      ? this.pagos.filter(p => [this.nombreDe(p.paciente_id), p.concepto ?? '', p.metodo_pago ?? '', p.estado ?? ''].join(' ').toLowerCase().includes(q))
      : this.pagos;
  }

  armarDias() {
    const m = this.mes;
    const desfase = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;
    const total = Math.ceil((desfase + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7) * 7;
    this.diasMes = Array.from({ length: total }, (_, i) => new Date(m.getFullYear(), m.getMonth(), 1 - desfase + i));
  }

  async cargarTurnos() {
    if (!this.userId || !this.diasMes.length) { this.turnos = []; this.porDia.clear(); return; }
    const d = this.diasMes, ult = d[d.length - 1];
    const { data, error } = await this.supabase.from('turnos').select('*').eq('psicologo_id', this.userId)
      .gte('fecha_hora_inicio', d[0].toISOString())
      .lt('fecha_hora_inicio', new Date(ult.getFullYear(), ult.getMonth(), ult.getDate() + 1).toISOString())
      .order('fecha_hora_inicio');
    if (error) return console.error('Error al cargar los turnos de la agenda:', error);
    this.turnos = (data ?? []) as Turno[];
    this.porDia = new Map();
    for (const t of this.turnos) {
      const k = clave(new Date(t.fecha_hora_inicio));
      this.porDia.set(k, [...(this.porDia.get(k) ?? []), t]);
    }
    if (this.turnoSel) this.turnoSel = this.turnos.find(t => t.id === this.turnoSel!.id) ?? null;
    this.cdr.detectChanges();
  }

  async cargarHoy() {
    if (!this.userId) { this.turnosHoy = []; return; }
    const h = new Date();
    const { data, error } = await this.supabase.from('turnos').select('*').eq('psicologo_id', this.userId)
      .gte('fecha_hora_inicio', new Date(h.getFullYear(), h.getMonth(), h.getDate()).toISOString())
      .lt('fecha_hora_inicio', new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1).toISOString())
      .order('fecha_hora_inicio');
    if (error) return console.error('Error al cargar los turnos de hoy:', error);
    this.turnosHoy = (data ?? []) as Turno[];
    this.cdr.detectChanges();
  }

  irMes(delta: number) {
    this.mes = new Date(this.mes.getFullYear(), this.mes.getMonth() + delta, 1);
    this.turnoSel = null;
    this.armarDias();
    this.cargarTurnos();
  }

  irHoy() {
    const ahora = new Date();
    this.mes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    this.diaSel = ahora;
    this.turnoSel = null;
    this.armarDias();
    this.cargarTurnos();
  }

  elegirDia(d: Date) {
    this.diaSel = d;
    this.turnoSel = null;
    if (d.getMonth() !== this.mes.getMonth() || d.getFullYear() !== this.mes.getFullYear()) {
      this.mes = new Date(d.getFullYear(), d.getMonth(), 1);
      this.armarDias();
      this.cargarTurnos();
    }
  }

  elegirTurno(t: Turno, e?: Event) {
    e?.stopPropagation();
    this.diaSel = new Date(t.fecha_hora_inicio);
    this.turnoSel = t;
  }

  async cambiarEstadoTurno(t: Turno, estado: EstadoTurno) {
    const { error } = await this.supabase.from('turnos').update({ estado }).eq('id', t.id).eq('psicologo_id', this.userId);
    if (error) {
      console.error('Error al actualizar el turno:', error);
      return alert('No se pudo actualizar el turno: ' + error.message);
    }
    await Promise.all([this.cargarTurnos(), this.cargarHoy()]);
  }

  turnosDe = (d: Date) => this.porDia.get(clave(d)) ?? [];
  get delDia() { return this.turnosDe(this.diaSel); }
  get tituloMes() { return mayus(this.mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })); }
  get tituloDia() { return mayus(this.diaSel.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })); }
  get turnosHoyActivos() { return this.turnosHoy.filter(t => t.estado !== 'cancelado').length; }
  esHoy = (d: Date) => clave(d) === clave(new Date());
  esSel = (d: Date) => clave(d) === clave(this.diaSel);
  esMes = (d: Date) => d.getMonth() === this.mes.getMonth() && d.getFullYear() === this.mes.getFullYear();

  abrir(m: Exclude<Modal, null>, fecha: Date = this.diaSel) {
    this.error = '';
    this.archivo = null;
    this.nuevoPaciente = { nombre: '', apellido: '', dni: '', telefono: '', fecha_nacimiento: '', escolaridad: '', tutor_nombre: '', modalidad_pago: 'Particular', obra_social: '', estado: 'En tratamiento' };
    this.nuevoTurno = { paciente_id: '', fecha: clave(fecha), hora: '10:00', duracion: 60, observaciones: '' };
    this.nuevoDoc = { paciente_id: '', titulo: '', tipo: 'Informe clínico' };
    this.nuevoPago = { paciente_id: '', monto: null, concepto: 'Sesión', metodo_pago: 'Efectivo' };
    if (m !== 'estadoPaciente') this.pacienteEstado = null;
    this.modal = m;
  }

  cerrar() {
    this.modal = null;
    this.pacienteEstado = null;
    this.error = '';
    this.archivo = null;
  }

  private terminar() {
    this.guardando = false;
    this.cerrar();
    this.cdr.detectChanges();
  }

  private fallo(msg: string) {
    this.error = msg;
    this.guardando = false;
    this.cdr.detectChanges();
  }

  private pacienteInvalido(id: string) {
    if (this.pacientes.some(p => p.id === id)) return false;
    this.fallo('El paciente seleccionado no existe o no pertenece a tu lista.');
    return true;
  }

  guardar() {
    if (!this.modal || this.guardando) return;
    ({
      paciente: () => this.guardarPaciente(),
      turno: () => this.guardarTurno(),
      documento: () => this.guardarDocumento(),
      pago: () => this.guardarPago(),
      estadoPaciente: () => this.guardarEstadoPaciente()
    })[this.modal]?.();
  }

  onArchivo(e: Event) { this.archivo = (e.target as HTMLInputElement).files?.[0] ?? null; }

  get edadNuevo() { return this.calcularEdad(this.nuevoPaciente.fecha_nacimiento); }

  calcularEdad(f?: string): number | null {
    if (!f) return null;
    const n = new Date(`${f}T00:00:00`), h = new Date();
    if (Number.isNaN(n.getTime()) || n > h) return null;
    let e = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
    return e >= 0 ? e : null;
  }

  editarEstadoPaciente(p: Paciente) {
    this.error = '';
    this.pacienteEstado = p;
    this.estadoPacienteNuevo = p.estado || 'En tratamiento';
    this.modal = 'estadoPaciente';
  }

  async guardarEstadoPaciente() {
    const p = this.pacienteEstado;
    if (!p?.id) return this.fallo('No se encontró el paciente que querés actualizar.');
    this.guardando = true;
    this.error = '';
    try {
      const { error } = await this.supabase.from('pacientes').update({ estado: this.estadoPacienteNuevo }).eq('id', p.id).eq('psicologo_id', this.userId);
      if (error) {
        console.error('Error al actualizar el estado:', error);
        return this.fallo('No se pudo actualizar el estado: ' + error.message);
      }
      p.estado = this.estadoPacienteNuevo;
      this.recalcular();
      this.terminar();
    } catch (e) {
      console.error(e);
      this.fallo('Ocurrió un error al actualizar el paciente. Revisá la conexión e intentá nuevamente.');
    }
  }

  async guardarPaciente() {
    const n = this.nuevoPaciente, edad = this.edadNuevo, menor = edad !== null && edad < 18;
    if (!String(n.nombre ?? '').trim() || !String(n.apellido ?? '').trim()) return this.fallo('Completá nombre y apellido.');
    if (menor && !String(n.tutor_nombre ?? '').trim()) return this.fallo('Es menor de edad: indicá el nombre del tutor.');
    this.guardando = true;
    this.error = '';
    try {
      const { error } = await this.supabase.from('pacientes').insert({
        nombre: String(n.nombre).trim(),
        apellido: String(n.apellido).trim(),
        dni: String(n.dni ?? '').trim() || null,
        telefono: String(n.telefono ?? '').trim() || null,
        fecha_nacimiento: n.fecha_nacimiento || null,
        edad,
        es_menor: menor,
        tutor_nombre: menor ? String(n.tutor_nombre).trim() : null,
        escolaridad: String(n.escolaridad ?? '').trim() || null,
        modalidad_pago: n.modalidad_pago,
        obra_social: n.modalidad_pago === 'Obra social' ? String(n.obra_social ?? '').trim() || null : null,
        estado: n.estado,
        psicologo_id: this.userId
      });
      if (error) {
        console.error('Error al guardar el paciente:', error);
        return this.fallo('No se pudo guardar: ' + error.message);
      }
      this.terminar();
      await this.cargarDatosCompletos();
    } catch (e) {
      console.error('Error inesperado al guardar el paciente:', e);
      this.fallo('Ocurrió un error al guardar el paciente.');
    }
  }

  async guardarTurno() {
    const n = this.nuevoTurno, duracion = Number(n.duracion);
    if (!n.paciente_id || !n.fecha || !n.hora) return this.fallo('Elegí paciente, fecha y hora.');
    if (this.pacienteInvalido(n.paciente_id)) return;
    if (!Number.isFinite(duracion) || duracion <= 0) return this.fallo('Seleccioná una duración válida.');
    const [anio, mes, dia] = String(n.fecha).split('-').map(Number);
    const [hora, minuto] = String(n.hora).split(':').map(Number);
    const ini = new Date(anio, mes - 1, dia, hora, minuto), fin = new Date(ini.getTime() + duracion * 60000);
    if (Number.isNaN(ini.getTime()) || ini.getFullYear() !== anio || ini.getMonth() !== mes - 1 || ini.getDate() !== dia || hora > 23 || minuto > 59)
      return this.fallo('La fecha o la hora no son válidas.');
    if (ini < new Date()) return this.fallo('No podés registrar un turno en una fecha y hora que ya pasaron.');
    this.guardando = true;
    this.error = '';
    try {
      const { data: existentes, error: consultaError } = await this.supabase.from('turnos')
        .select('id, fecha_hora_inicio, fecha_hora_final, estado').eq('psicologo_id', this.userId)
        .gte('fecha_hora_inicio', new Date(anio, mes - 1, dia).toISOString())
        .lt('fecha_hora_inicio', new Date(anio, mes - 1, dia + 1).toISOString());
      if (consultaError) {
        console.error('Error al verificar la disponibilidad:', consultaError);
        return this.fallo('No se pudo verificar la disponibilidad: ' + consultaError.message);
      }
      const superpuesto = (existentes ?? []).some((t: any) =>
        t.estado !== 'cancelado' && ini < new Date(t.fecha_hora_final) && fin > new Date(t.fecha_hora_inicio));
      if (superpuesto) return this.fallo('Ya tenés un turno que se superpone en ese horario.');
      const { error } = await this.supabase.from('turnos').insert({
        paciente_id: n.paciente_id,
        psicologo_id: this.userId,
        fecha_hora_inicio: ini.toISOString(),
        fecha_hora_final: fin.toISOString(),
        estado: 'pendiente',
        observaciones: String(n.observaciones ?? '').trim() || null,
        nombre_paciente_turno: this.nombreDe(n.paciente_id)
      });
      if (error) {
        console.error('Error al guardar el turno:', error);
        return this.fallo('No se pudo guardar el turno: ' + error.message);
      }
      this.terminar();
      this.diaSel = new Date(anio, mes - 1, dia);
      this.mes = new Date(anio, mes - 1, 1);
      this.armarDias();
      await Promise.all([this.cargarTurnos(), this.cargarHoy()]);
    } catch (e) {
      console.error('Error inesperado al guardar el turno:', e);
      this.fallo('Ocurrió un error al guardar el turno. Revisá la conexión e intentá nuevamente.');
    }
  }

  async guardarDocumento() {
    const n = this.nuevoDoc, f = this.archivo;
    if (!n.paciente_id || !String(n.titulo ?? '').trim() || !f) return this.fallo('Elegí paciente, título y archivo.');
    if (!this.userId) return this.fallo('No se identificó al profesional.');
    if (this.pacienteInvalido(n.paciente_id)) return;
    this.guardando = true;
    this.error = '';
    const path = `${this.userId}/${n.paciente_id}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`;
    try {
      const { error: errorSubida } = await this.supabase.storage.from('informes').upload(path, f);
      if (errorSubida) {
        console.error('Error al subir el documento:', errorSubida);
        return this.fallo('No se pudo subir el archivo: ' + errorSubida.message);
      }
      const { error: errorRegistro } = await this.supabase.from('informes').insert({
        paciente_id: n.paciente_id,
        psicologo_id: this.userId,
        titulo: String(n.titulo).trim(),
        tipo: n.tipo || 'Informe clínico',
        archivo_url: { path, nombre: f.name, mime: f.type }
      });
      if (errorRegistro) {
        console.error('Error al registrar el documento:', errorRegistro);
        const { error: errorEliminacion } = await this.supabase.storage.from('informes').remove([path]);
        if (errorEliminacion) console.error('No se pudo eliminar el archivo subido:', errorEliminacion);
        return this.fallo('El archivo se subió, pero no se pudo registrar en la base de datos: ' + errorRegistro.message);
      }
      this.terminar();
      await this.cargarDatosCompletos();
    } catch (e) {
      console.error('Error inesperado al guardar el documento:', e);
      this.fallo('Ocurrió un error al subir el documento. Revisá la conexión e intentá nuevamente.');
    }
  }

  async abrirDocumento(d: Documento, descargar: boolean) {
    const a = d.archivo_url;
    if (!a?.path) return alert('El documento no tiene una ruta de archivo válida.');
    const ventana = descargar ? null : window.open('', '_blank');
    const { data, error } = await this.supabase.storage.from('informes')
      .createSignedUrl(a.path, 300, descargar ? { download: a.nombre } : undefined);
    if (error || !data) {
      ventana?.close();
      console.error('Error al abrir el documento:', error);
      return alert('No se pudo abrir el documento: ' + (error?.message ?? 'Error desconocido'));
    }
    if (ventana) ventana.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank');
  }

  async eliminarDocumento(d: Documento) {
    if (!this.userId) return alert('No se identificó al profesional.');
    if (!window.confirm(`¿Eliminar el documento "${d.titulo}" de ${this.nombreDe(d.paciente_id)}? Esta acción no se puede deshacer.`)) return;
    try {
      const { data, error } = await this.supabase.from('informes').delete().eq('id', d.id).eq('psicologo_id', this.userId).select('id');
      if (error) {
        console.error('Error al eliminar el documento:', error);
        return alert('No se pudo eliminar el documento: ' + error.message);
      }
      if (!data?.length) return alert('No se eliminó ningún registro. Verificá los permisos de la tabla informes.');
      this.documentos = this.documentos.filter(x => x.id !== d.id);
      this.recalcular();
      this.cdr.detectChanges();
      if (d.archivo_url?.path) {
        const { error: errorArchivo } = await this.supabase.storage.from('informes').remove([d.archivo_url.path]);
        if (errorArchivo) {
          console.error('El registro se eliminó, pero no el archivo:', errorArchivo);
          alert('El documento se quitó de la lista, pero el archivo quedó almacenado. Revisá las políticas de eliminación del bucket informes.');
        }
      }
    } catch (e) {
      console.error('Error inesperado al eliminar el documento:', e);
      alert('Ocurrió un error al eliminar el documento.');
    }
  }

  async guardarPago() {
    const n = this.nuevoPago, monto = Number(n.monto);
    if (!n.paciente_id || !Number.isFinite(monto) || monto <= 0) return this.fallo('Elegí un paciente e indicá un monto válido.');
    if (!this.userId) return this.fallo('No se identificó al profesional. Volvé a iniciar sesión.');
    if (this.pacienteInvalido(n.paciente_id)) return;
    this.guardando = true;
    this.error = '';
    try {
      const { data, error } = await this.supabase.from('pagos').insert({
        paciente_id: n.paciente_id,
        psicologo_id: this.userId,
        monto,
        concepto: String(n.concepto ?? '').trim() || 'Sesión',
        metodo_pago: n.metodo_pago || 'Efectivo',
        estado: 'pendiente'
      }).select().single();
      if (error) {
        console.error('Error al guardar el pago:', error);
        return this.fallo('No se pudo guardar el cobro: ' + error.message);
      }
      this.pagos = [data as Pago, ...this.pagos];
      this.recalcular();
      this.terminar();
    } catch (e) {
      console.error('Error inesperado al guardar el pago:', e);
      this.fallo('Ocurrió un error al guardar el cobro. Revisá la conexión e intentá nuevamente.');
    }
  }

  async cambiarEstadoPago(p: Pago, estado: EstadoPago) {
    const fecha_pago = estado === 'confirmado' ? new Date().toISOString() : null;
    try {
      const { error } = await this.supabase.from('pagos').update({ estado, fecha_pago }).eq('id', p.id).eq('psicologo_id', this.userId);
      if (error) {
        console.error('Error al actualizar el pago:', error);
        return alert('No se pudo actualizar el pago: ' + error.message);
      }
      p.estado = estado;
      p.fecha_pago = fecha_pago;
      this.recalcular();
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Error inesperado al actualizar el pago:', e);
      alert('Ocurrió un error al actualizar el estado del pago.');
    }
  }

  async eliminarPago(p: Pago) {
    if (!this.userId) return alert('No se identificó al profesional.');
    if (!window.confirm(`¿Eliminar el cobro de ${this.nombreDe(p.paciente_id)} por ${this.moneda(p.monto)}? Esta acción no se puede deshacer.`)) return;
    try {
      const { data, error } = await this.supabase.from('pagos').delete().eq('id', p.id).eq('psicologo_id', this.userId).select('id');
      if (error) {
        console.error('Error al eliminar el cobro:', error);
        return alert('No se pudo eliminar el cobro: ' + error.message);
      }
      if (!data?.length) return alert('No se eliminó ningún cobro. Verificá los permisos de la tabla pagos.');
      this.pagos = this.pagos.filter(x => x.id !== p.id);
      this.recalcular();
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Error inesperado al eliminar el cobro:', e);
      alert('Ocurrió un error al eliminar el cobro.');
    }
  }

  nombreDe(id: string) {
    const p = this.pacientes.find(x => x.id === id);
    return p ? `${p.apellido}, ${p.nombre}` : 'Paciente';
  }
  nombreTurno = (t: Turno) => t.nombre_paciente_turno || this.nombreDe(t.paciente_id);
  edadDe = (p: Paciente) => this.calcularEdad(p.fecha_nacimiento) ?? p.edad ?? null;
  claseEstado = (e?: string) => (e === 'En tratamiento' ? 'active' : e === 'Alta' ? 'alta' : 'abandono');
  hora = (t: Turno) => hhmm(t.fecha_hora_inicio);
  rango = (t: Turno) => `${hhmm(t.fecha_hora_inicio)} a ${hhmm(t.fecha_hora_final)} hs`;
  fechaLarga = (t: Turno) => mayus(new Date(t.fecha_hora_inicio).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
  cap = mayus;
  moneda = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0);

  async logout() {
    if (this.loggingOut) return;
    this.loggingOut = true;
    try {
      await this.authService.signOut();
      await this.router.navigate(['/login']);
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
      this.loggingOut = false;
    }
  }
}