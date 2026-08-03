const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // File
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  importCSV: (opts) => ipcRenderer.invoke('csv:import', opts),

  // Leads
  getLeadLists: () => ipcRenderer.invoke('leads:getLists'),
  getContacts: (listId) => ipcRenderer.invoke('leads:getContacts', listId),
  deleteLeadList: (listId) => ipcRenderer.invoke('leads:deleteList', listId),
  resetLeadList: (listId) => ipcRenderer.invoke('leads:resetList', listId),

  // Campaigns
  getCampaigns: () => ipcRenderer.invoke('campaigns:getAll'),
  createCampaign: (data) => ipcRenderer.invoke('campaigns:create', data),
  startBlast: (campaignId) => ipcRenderer.invoke('campaigns:blast', campaignId),
  cancelBlast: () => ipcRenderer.invoke('campaigns:cancel'),

  // Conversations
  getConversations: () => ipcRenderer.invoke('conversations:getAll'),
  searchConversations: (query) => ipcRenderer.invoke('conversations:search', query),
  getMessages: (convId) => ipcRenderer.invoke('conversations:getMessages', convId),
  sendMessage: (data) => ipcRenderer.invoke('conversations:sendMessage', data),
  markRead: (convId) => ipcRenderer.invoke('conversations:markRead', convId),
  startManualConversation: (data) => ipcRenderer.invoke('conversations:startManual', data),
  aiUnlock: (password) => ipcRenderer.invoke('ai:unlock', password),
  aiLockStatus: () => ipcRenderer.invoke('ai:lockStatus'),
  aiLock: () => ipcRenderer.invoke('ai:lock'),
  updateCategory: (data) => ipcRenderer.invoke('conversations:updateCategory', data),
  archiveConversation: (convId) => ipcRenderer.invoke('conversations:archive', convId),
  deleteConversation: (convId) => ipcRenderer.invoke('conversations:delete', convId),
  setConversationForward: (data) => ipcRenderer.invoke('conversations:setForward', data),
  getTotalUnread: () => ipcRenderer.invoke('conversations:getTotalUnread'),
  setConversationEmoji: (data) => ipcRenderer.invoke('conversations:setEmoji', data),
  setConversationAddress: (data) => ipcRenderer.invoke('conversations:setAddress', data),
  hotFuGet: (convId) => ipcRenderer.invoke('hotfu:get', convId),
  hotFuArm: (convId) => ipcRenderer.invoke('hotfu:arm', convId),
  hotFuPause: (convId) => ipcRenderer.invoke('hotfu:pause', convId),
  hotFuResume: (convId) => ipcRenderer.invoke('hotfu:resume', convId),
  hotFuStop: (convId) => ipcRenderer.invoke('hotfu:stop', convId),
  hotFuLog: (convId) => ipcRenderer.invoke('hotfu:log', convId),
  hotFuSimulate: (opts) => ipcRenderer.invoke('hotfu:simulate', opts),

  deleteCampaign: (id) => ipcRenderer.invoke('campaigns:delete', id),
  refreshCampaignStats: (id) => ipcRenderer.invoke('campaigns:refreshStats', id),

  // Safety
  getBlastPreview: (id) => ipcRenderer.invoke('campaigns:getBlastPreview', id),
  getFollowUpPreview: (id) => ipcRenderer.invoke('campaigns:getFollowUpPreview', id),
  startFollowUpBlast: (data) => ipcRenderer.invoke('campaigns:followUpBlast', data),
  getAllFollowUpPreview: () => ipcRenderer.invoke('campaigns:getAllFollowUpPreview'),
  startAllFollowUpBlast: (data) => ipcRenderer.invoke('campaigns:allFollowUpBlast', data),
  resumeCampaign: (id) => ipcRenderer.invoke('campaigns:resume', id),
  resetCampaign: (id) => ipcRenderer.invoke('campaigns:reset', id),
  getAuditLog: () => ipcRenderer.invoke('audit:getLog'),

  // Twilio
  pollNow: () => ipcRenderer.invoke('twilio:poll'),
  verifyTwilio: (creds) => ipcRenderer.invoke('twilio:verify', creds),
  getAccountBalance: () => ipcRenderer.invoke('twilio:getAccountBalance'),
  getBlastCostEstimate: (data) => ipcRenderer.invoke('twilio:getBlastCostEstimate', data),

  // Claude AI
  verifyClaudeKey: (key) => ipcRenderer.invoke('claude:verify', key),
  aiSimulate: (data) => ipcRenderer.invoke('ai:simulate', data),
  importAiExamples: () => ipcRenderer.invoke('ai:importExamples'),
  getAiExampleStats: () => ipcRenderer.invoke('ai:getExampleStats'),
  clearAiExamples: () => ipcRenderer.invoke('ai:clearExamples'),

  // Updater
  getVersion: () => ipcRenderer.invoke('updater:getVersion'),
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  installUpdate: (args) => ipcRenderer.invoke('updater:install', args),
  onUpdateProgress: (cb) => {
    const handler = (_, pct) => cb(pct);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),

  // Overview
  getOverviewStats: (period) => ipcRenderer.invoke('overview:getStats', period),

  // Notes
  getNotes: () => ipcRenderer.invoke('notes:getAll'),
  createNote: (data) => ipcRenderer.invoke('notes:create', data),
  updateNote: (data) => ipcRenderer.invoke('notes:update', data),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  incrementNoteCopy: (id) => ipcRenderer.invoke('notes:incrementCopy', id),
  reorderNotes: (orderedIds) => ipcRenderer.invoke('notes:reorder', orderedIds),

  // Contacts
  renameContact: (data) => ipcRenderer.invoke('contacts:rename', data),
  searchAllContacts: (query) => ipcRenderer.invoke('contacts:searchAll', query),

  // Lead Submissions
  getLeadSubmissions: () => ipcRenderer.invoke('lead-submit:getAll'),
  createLeadSubmission: () => ipcRenderer.invoke('lead-submit:create'),
  updateLeadSubmission: (data) => ipcRenderer.invoke('lead-submit:update', data),
  deleteLeadSubmission: (id) => ipcRenderer.invoke('lead-submit:delete', id),
  getConvMedia: () => ipcRenderer.invoke('lead-submit:getConvMedia'),
  pickLeadPhoto: () => ipcRenderer.invoke('lead-submit:pickPhoto'),
  sendLead: (data) => ipcRenderer.invoke('lead-submit:send', data),
  setLeadOutcome: (data) => ipcRenderer.invoke('lead-submit:setOutcome', data),
  setLeadContact: (data) => ipcRenderer.invoke('lead-submit:setContact', data),
  getCampaignLeadKPIs: (id) => ipcRenderer.invoke('campaigns:getLeadKPIs', id),
  getCampaignConvStats: (id) => ipcRenderer.invoke('campaigns:getConvStats', id),

  // Voice
  requestMicPermission: () => ipcRenderer.invoke('voice:requestMicPermission'),
  getVoiceToken: () => ipcRenderer.invoke('voice:getToken'),
  logCall: (data) => ipcRenderer.invoke('voice:logCall', data),

  // Shell
  shellOpenExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  downloadAllMedia: (data) => ipcRenderer.invoke('media:downloadAll', data),
  exportTranscripts: () => ipcRenderer.invoke('db:exportTranscripts'),

  // Events from main
  onNewMessages: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('new-messages', handler);
    return () => ipcRenderer.removeListener('new-messages', handler);
  },
  onBlastProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('blast-progress', handler);
    return () => ipcRenderer.removeListener('blast-progress', handler);
  },
});
