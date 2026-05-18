import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ReconRun } from '../../database/entities/recon-run.entity';
import { ReconException } from '../../database/entities/recon-exception.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly cfg: ConfigService) {
    const host = cfg.get<string>('SMTP_HOST');
    const port = parseInt(cfg.get<string>('SMTP_PORT') || '587', 10);
    const user = cfg.get<string>('SMTP_USER');
    const pass = cfg.get<string>('SMTP_PASS');
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host, port,
        secure: cfg.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — alerts will only be logged.');
    }
  }

  async sendExceptionAlert(run: ReconRun, exceptions: ReconException[]) {
    const to = (this.cfg.get<string>('ALERT_TO') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const from = this.cfg.get<string>('ALERT_FROM') || 'alerts@indiraivf.com';
    const subject = `🔔 Vendor Recon — ${exceptions.length} exceptions on ${new Date(run.startedAt).toLocaleDateString()}`;
    const html = this.buildHtml(run, exceptions);
    if (!this.transporter || to.length === 0) {
      this.logger.log(`[DRY-RUN] Alert: ${subject}`);
      return { dryRun: true };
    }
    await this.transporter.sendMail({ from, to, subject, html });
    this.logger.log(`📧 Alert sent to ${to.join(', ')}`);
    return { dryRun: false, recipients: to };
  }

  private buildHtml(run: ReconRun, exceptions: ReconException[]) {
    const top = exceptions.slice(0, 15);
    const colour = (s: string) => ({ CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04', LOW: '#16a34a' } as any)[s] || '#566071';
    const rows = top.map((e) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.vendorCode}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.vendorName ?? ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.type}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${colour(e.severity)};font-weight:bold">${e.severity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${(e.description ?? '').slice(0, 120)}</td>
      </tr>`).join('');
    return `<!doctype html><html><body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#f6f7f9;padding:24px;color:#0f1320">
<div style="max-width:780px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="background:#0f1320;color:#fff;padding:20px 24px">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#f25a14">Indira IVF • P2P ↔ Oracle ERP</p>
    <h2 style="margin:6px 0 0;font-size:20px;font-weight:600">Vendor Master Reconciliation Alert</h2>
  </div>
  <div style="padding:24px">
    <table style="width:100%;font-size:13px;margin-bottom:18px">
      <tr><td style="padding:6px 0;color:#566071">Run started</td><td>${new Date(run.startedAt).toLocaleString()}</td></tr>
      <tr><td style="padding:6px 0;color:#566071">P2P vendors</td><td>${run.totalP2pVendors}</td></tr>
      <tr><td style="padding:6px 0;color:#566071">ERP vendors</td><td>${run.totalErpVendors}</td></tr>
      <tr><td style="padding:6px 0;color:#566071">Common</td><td>${run.commonVendors}</td></tr>
      <tr><td style="padding:6px 0;color:#566071">Missing in ERP</td><td><b>${run.missingInErpCount}</b></td></tr>
      <tr><td style="padding:6px 0;color:#566071">Missing in P2P</td><td><b>${run.missingInP2pCount}</b></td></tr>
      <tr><td style="padding:6px 0;color:#566071">Match rate</td><td><b>${(run.matchRatePct / 100).toFixed(2)}%</b></td></tr>
      <tr><td style="padding:6px 0;color:#566071">Total exceptions</td><td style="color:#dc2626;font-weight:bold">${run.totalExceptions}</td></tr>
    </table>
    <h3 style="font-size:14px;margin:0 0 8px">Top exceptions (showing ${top.length} of ${exceptions.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f9f6ec"><th style="padding:8px 12px;text-align:left">Vendor</th><th style="padding:8px 12px;text-align:left">Name</th><th style="padding:8px 12px;text-align:left">Type</th><th style="padding:8px 12px;text-align:left">Severity</th><th style="padding:8px 12px;text-align:left">Description</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:18px;font-size:12px;color:#566071">Open the Vendor Recon dashboard to triage and resolve these exceptions.</p>
  </div>
</div></body></html>`;
  }
}
