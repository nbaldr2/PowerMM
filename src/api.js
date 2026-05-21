/**
 * MoonMailer Pro — API Client
 * Connects the React frontend to the Express backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem('mm_access_token') || null;
    this.onAuthError = null;
  }

  setToken(token) {
    this.accessToken = token;
    if (token) localStorage.setItem('mm_access_token', token);
    else localStorage.removeItem('mm_access_token');
  }

  async request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const config = { ...options, headers, credentials: 'include' };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      config.body = JSON.stringify(options.body);
    }
    if (options.body instanceof FormData) {
      delete headers['Content-Type']; // Let browser set multipart boundary
    }

    const res = await fetch(url, config);

    // Handle token expiry — auto-refresh
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.code === 'TOKEN_EXPIRED') {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          return fetch(url, { ...config, headers });
        }
      }
      if (this.onAuthError) this.onAuthError();
      throw new Error(data.error || 'Authentication required');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // Handle SSE streams
    if (res.headers.get('Content-Type')?.includes('text/event-stream')) {
      return res;
    }
    // Handle CSV downloads
    if (res.headers.get('Content-Type')?.includes('text/csv')) {
      return res;
    }

    return res.json();
  }

  async refreshToken() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setToken(data.accessToken);
      return true;
    } catch { return false; }
  }

  // ============================================================
  // AUTH
  // ============================================================
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST', body: { email, password },
    });
    this.setToken(data.accessToken);
    return data;
  }

  async register(email, password, name) {
    return this.request('/auth/register', {
      method: 'POST', body: { email, password, name },
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' }).catch(() => {});
    this.setToken(null);
  }

  async getSessions() {
    return this.request('/auth/sessions');
  }

  async revokeSession(sessionId) {
    return this.request(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  }

  // ============================================================
  // SMTP
  // ============================================================
  async getSmtpServers() {
    return this.request('/smtp');
  }

  async addSmtpServer(server) {
    return this.request('/smtp', { method: 'POST', body: server });
  }

  async updateSmtpServer(id, data) {
    return this.request(`/smtp/${id}`, { method: 'PUT', body: data });
  }

  async deleteSmtpServer(id) {
    return this.request(`/smtp/${id}`, { method: 'DELETE' });
  }

  async testSmtpServer(id) {
    return this.request(`/smtp/${id}/test`, { method: 'POST' });
  }

  async testSmtpInline(config) {
    return this.request('/smtp/test-inline', { method: 'POST', body: config });
  }

  async fillFromPmta() {
    return this.request('/smtp/fill-pmta', { method: 'POST' });
  }

  async getSmtpPools() {
    return this.request('/smtp/pools');
  }

  // ============================================================
  // CAMPAIGNS
  // ============================================================
  async getCampaigns(page = 1, limit = 20, status) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.append('status', status);
    return this.request(`/campaigns?${params}`);
  }

  async getCampaign(id) {
    return this.request(`/campaigns/${id}`);
  }

  async createCampaign(data) {
    return this.request('/campaigns', { method: 'POST', body: data });
  }

  async sendCampaign(id) {
    return this.request(`/campaigns/${id}/send`, { method: 'POST' });
  }

  async pauseCampaign(id) {
    return this.request(`/campaigns/${id}/pause`, { method: 'POST' });
  }

  async resumeCampaign(id) {
    return this.request(`/campaigns/${id}/resume`, { method: 'POST' });
  }

  async cancelCampaign(id) {
    return this.request(`/campaigns/${id}/cancel`, { method: 'POST' });
  }

  async getCampaignStats(id) {
    return this.request(`/campaigns/${id}/stats`);
  }

  async getCampaignLogs(id, page = 1, status) {
    const params = new URLSearchParams({ page });
    if (status) params.append('status', status);
    return this.request(`/campaigns/${id}/logs?${params}`);
  }

  async deleteCampaign(id) {
    return this.request(`/campaigns/${id}`, { method: 'DELETE' });
  }

  // ============================================================
  // LISTS
  // ============================================================
  async getLists() {
    return this.request('/lists');
  }

  async createList(name, description) {
    return this.request('/lists', { method: 'POST', body: { name, description } });
  }

  async importRecipients(listId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/lists/${listId}/import`, {
      method: 'POST', body: formData,
    });
  }

  async importRecipientsRaw(listId, emails) {
    return this.request(`/lists/${listId}/import`, {
      method: 'POST', body: { emails },
    });
  }

  async runHygiene(listId) {
    return this.request(`/lists/${listId}/hygiene`, { method: 'POST' });
  }

  async exportList(listId) {
    return this.request(`/lists/${listId}/export`);
  }

  async deleteList(id) {
    return this.request(`/lists/${id}`, { method: 'DELETE' });
  }

  async getSuppressionList() {
    return this.request('/lists/suppression');
  }

  async addToSuppression(email, reason) {
    return this.request('/lists/suppression', { method: 'POST', body: { email, reason } });
  }

  // ============================================================
  // PMTA
  // ============================================================
  async testSsh(config) {
    return this.request('/pmta/test-ssh', { method: 'POST', body: config });
  }

  async savePmtaConfig(config) {
    return this.request('/pmta/config', { method: 'POST', body: config });
  }

  async getPmtaConfig() {
    return this.request('/pmta/config');
  }

  async generateDnsRecords(config) {
    return this.request('/pmta/dns-records', { method: 'POST', body: config });
  }

  async pmtaServiceControl(action) {
    return this.request(`/pmta/service/${action}`, { method: 'POST' });
  }

  async installPmta() {
    return this.request('/pmta/install', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
    });
  }

  async loadPmtaConfig() {
    return this.request('/pmta/load-config', { method: 'POST' });
  }

  // ============================================================
  // ANALYTICS
  // ============================================================
  async getDashboard() {
    return this.request('/analytics/dashboard');
  }

  async getCampaignAnalytics(id) {
    return this.request(`/analytics/campaign/${id}`);
  }

  async exportCampaignReport(id) {
    return this.request(`/analytics/campaign/${id}/export`);
  }

  // ============================================================
  // IP CHECKER
  // ============================================================
  async checkIpReputation(ip, domain) {
    return this.request('/ipchecker/check', { method: 'POST', body: { ip, domain } });
  }

  async generateWarmup(targetVolume, startVolume) {
    return this.request('/ipchecker/warmup', { method: 'POST', body: { targetVolume, startVolume } });
  }

  // ============================================================
  // SPAM CHECKS
  // ============================================================
  async checkSpamAssassin(data) {
    return this.request('/spamcheck/spamassassin', { method: 'POST', body: data });
  }

  async checkCloudmark(data) {
    return this.request('/spamcheck/cloudmark', { method: 'POST', body: data });
  }

  // ============================================================
  // HEALTH
  // ============================================================
  async getHealth() {
    return this.request('/health');
  }
}

// Singleton
const api = new ApiClient();
export default api;
