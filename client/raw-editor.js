/* Raw Editor core (adapted) - removed immediate instantiation so caller can init with project files */
class EditorApp {
  constructor() {
    // Core elements
    this.editor = document.getElementById('editor')
    this.tabsContainer = document.getElementById('tabs')
    this.lineNumbers = document.getElementById('lineNumbers')
    this.livePreview = document.getElementById('livePreview')
    this.langDisplay = document.getElementById('langDisplay')
    this.langSelector = document.getElementById('langSelector')

    // Top bar buttons
    this.saveBtn = document.getElementById('saveBtn')
    this.saveAsBtn = document.getElementById('saveAsBtn')
    this.openFileBtn = document.getElementById('openFileBtn')
    this.runHtmlBtn = document.getElementById('runHtmlBtn')
    this.runJsBtn = document.getElementById('runJsBtn')
    this.runPythonBtn = document.getElementById('runPythonBtn')
    this.viewHistoryBtn = document.getElementById('viewHistoryBtn')
    this.settingsBtn = document.getElementById('settingsBtn')

    this.togglePreviewBtn = document.getElementById('togglePreviewBtn')

    this.currentTab = null
    this.autosaveInterval = null
    this.livePreviewVisible = false
    this.consoleWindow = null
    window.editorApp = this // ensure global access for history restore
    this.bindEvents()
    this.init()
  }

  // ... (all methods copied exactly as in Raw Editor script) ...

  getTabs() {
    return JSON.parse(localStorage.getItem('savedcontent') || '{}')
  }

  getSettings() {
    return JSON.parse(localStorage.getItem('editorSettings') || '{"fontSize":16,"textColor":"#ffffff","bgColor":"#000000","autosave":5000,"theme":"dark","tabSize":2,"showLineNumbers":true,"livePreview":true}')
  }

  applySettings() {
    const s = this.getSettings()
    this.editor.style.fontSize = s.fontSize + 'px'
    this.editor.style.color = s.textColor
    this.editor.style.backgroundColor = s.bgColor
    clearInterval(this.autosaveInterval)
    this.autosaveInterval = setInterval(() => this.saveHistory(), s.autosave)
    this.lineNumbers.style.display = s.showLineNumbers ? 'block' : 'none'
  }

  saveHistory() {
    if (!this.currentTab || this.currentTab === 'Settings') return
    const tabs = this.getTabs()
    if (!tabs[this.currentTab]) return
    const historyKey = `history_${encodeURIComponent(this.currentTab)}`
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]')
    history.push({ timestamp: Date.now(), content: this.editor.value })
    localStorage.setItem(historyKey, JSON.stringify(history))
    tabs[this.currentTab].content = this.editor.value
    localStorage.setItem('savedcontent', JSON.stringify(tabs))
  }

  getLanguageIcon(lang) {
    switch (lang) {
      case 'html': return '🌐'
      case 'js': return '📜'
      case 'python': return '🐍'
      default: return '📄'
    }
  }

  loadTabs() {
    this.tabsContainer.innerHTML = ''
    const tabs = this.getTabs()
    Object.keys(tabs).forEach(tab => {
      const tabBtn = document.createElement('button')
      tabBtn.className = 'tab'
      tabBtn.textContent = this.getLanguageIcon(tabs[tab].language) + ' ' + tab
      tabBtn.onclick = () => this.switchTab(tab)
      const delBtn = document.createElement('button')
      delBtn.className = 'tab-close'
      delBtn.textContent = 'X'
      delBtn.onclick = () => this.deleteTab(tab)
      const wrapper = document.createElement('div')
      wrapper.className = 'tab-wrapper'
      wrapper.appendChild(tabBtn)
      wrapper.appendChild(delBtn)
      this.tabsContainer.appendChild(wrapper)
    })
    const addBtn = document.createElement('button')
    addBtn.textContent = '+'
    addBtn.className = 'tab-add'
    addBtn.onclick = () => {
      const name = prompt('New tab name')
      if (name) {
        const lang = prompt('Language? (html/js/python/text)', 'text')
        const tabs = this.getTabs()
        tabs[name] = { content: '', path: null, language: lang || 'text' }
        localStorage.setItem('savedcontent', JSON.stringify(tabs))
        this.loadTabs()
        this.switchTab(name)
      }
    }
    this.tabsContainer.appendChild(addBtn)
  }

  switchTab(tab) {
    if (tab === 'Settings') {
      this.openSettingsTab()
      return
    }
    const tabs = this.getTabs()
    if (!tabs[tab]) return
    this.editor.value = tabs[tab].content || ''
    this.currentTab = tab
    document.title = tab
    this.applySettings()
    this.updateLineNumbers()
    this.updateLangDisplay(tabs[tab].language || 'text')
    if (this.livePreviewVisible && tabs[tab].language === 'html') {
      this.livePreview.style.display = 'block'
      this.livePreview.srcdoc = this.editor.value
    } else {
      this.livePreview.style.display = 'none'
    }
  }

  deleteTab(tab) {
    if (confirm(`Delete tab "${tab}"?`)) {
      const tabs = this.getTabs()
      delete tabs[tab]
      localStorage.setItem('savedcontent', JSON.stringify(tabs))
      localStorage.removeItem(`history_${encodeURIComponent(tab)}`)
      this.loadTabs()
      this.switchTab(Object.keys(tabs)[0] || 'Settings')
    }
  }

  saveFile() {
    if (!this.currentTab) return
    const tabs = this.getTabs()
    const tab = tabs[this.currentTab]
    const filename = tab.path || prompt('Save as filename')
    if (filename) {
      tab.path = filename
      tab.content = this.editor.value
      localStorage.setItem('savedcontent', JSON.stringify(tabs))
      const blob = new Blob([this.editor.value], { type: 'text/plain' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      this.showPopup('Saved!')
    }
  }

  saveAs() {
    if (!this.currentTab) return
    const filename = prompt('Save as filename')
    if (!filename) return
    const tabs = this.getTabs()
    tabs[this.currentTab].path = filename
    tabs[this.currentTab].content = this.editor.value
    localStorage.setItem('savedcontent', JSON.stringify(tabs))
    const blob = new Blob([this.editor.value], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    this.showPopup('Saved As ' + filename)
  }

  openFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = e => {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = event => {
        const name = prompt('Tab name for opened file')
        if (name) {
          const lang = prompt('Language? (html/js/python/text)', 'text')
          const tabs = this.getTabs()
          tabs[name] = { content: event.target.result, path: file.name, language: lang || 'text' }
          localStorage.setItem('savedcontent', JSON.stringify(tabs))
          this.loadTabs()
          this.switchTab(name)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  runHtml() {
    const win = window.open('about:blank', '_blank')
    win.document.open()
    win.document.write(this.editor.value)
    win.document.close()
  }

  runJs() {
    const win = window.open('about:blank', '_blank')
    win.document.open()
    win.document.write(`<script>${this.editor.value}<\/script>`)
    win.document.close()
  }

  runPython() {
    const output = `Python executed:\n\n${this.editor.value.replace(/print\((.*)\)/g, '$1')}`
    const win = window.open('about:blank', '_blank')
    win.document.open()
    win.document.write(`<pre>${output}</pre>`)
    win.document.close()
  }

  openSettingsTab() {
    this.currentTab = 'Settings'
    document.title = 'Settings'
    const s = this.getSettings()
    this.editor.value =
      `Font Size: ${s.fontSize}\n` +
      `Text Color: ${s.textColor}\n` +
      `Background Color: ${s.bgColor}\n` +
      `Autosave Interval (ms): ${s.autosave}\n` +
      `Theme: ${s.theme}\n` +
      `Tab Size: ${s.tabSize}\n` +
      `Show Line Numbers: ${s.showLineNumbers}\n` +
      `Enable Live Preview: ${s.livePreview}\n\n` +
      `Change values and press Ctrl+Enter to apply.`
  }

  applyEditorSettingsFromText() {
    const lines = this.editor.value.split('\n')
    const s = {}
    lines.forEach(line => {
      const [key, value] = line.split(':').map(v => v && v.trim())
      if (key === 'Font Size') s.fontSize = parseInt(value)
      if (key === 'Text Color') s.textColor = value
      if (key === 'Background Color') s.bgColor = value
      if (key === 'Autosave Interval (ms)') s.autosave = parseInt(value)
      if (key === 'Theme') s.theme = value
      if (key === 'Tab Size') s.tabSize = parseInt(value)
      if (key === 'Show Line Numbers') s.showLineNumbers = (value === 'true')
      if (key === 'Enable Live Preview') s.livePreview = (value === 'true')
    })
    localStorage.setItem('editorSettings', JSON.stringify(s))
    this.applySettings()
    this.showPopup('Settings Saved!')
  }

  updateLineNumbers() {
    const lines = this.editor.value.split('\n').length
    this.lineNumbers.innerHTML = ''
    for (let i = 1; i <= lines; i++) {
      const div = document.createElement('div')
      div.textContent = i
      this.lineNumbers.appendChild(div)
    }
    this.lineNumbers.scrollTop = this.editor.scrollTop
  }

  updateLangDisplay(lang) {
    this.langDisplay.textContent = 'Language: ' + lang
    this.langSelector.value = lang
  }

  toggleLivePreview() {
    this.livePreviewVisible = !this.livePreviewVisible
    const tabs = this.getTabs()
    if (this.currentTab && tabs[this.currentTab].language === 'html' && this.livePreviewVisible) {
      this.livePreview.style.display = 'block'
      this.livePreview.srcdoc = this.editor.value
    } else {
      this.livePreview.style.display = 'none'
    }
  }

  showPopup(msg) {
    const popup = document.createElement('div')
    popup.className = 'popup'
    popup.textContent = msg
    document.body.appendChild(popup)
    setTimeout(() => popup.remove(), 1500)
  }

  viewHistory() {
    if (!this.currentTab || this.currentTab === 'Settings') return
    const historyKey = `history_${encodeURIComponent(this.currentTab)}`
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]')
    const win = window.open('about:blank', '_blank')
    win.document.open()
    win.document.write('<html><body><h2>History</h2>')
    history.forEach((entry, i) => {
      win.document.write(
        `<div>
           <strong>${new Date(entry.timestamp).toLocaleString()}</strong><br>
           <textarea rows="10" cols="80">${entry.content}</textarea><br>
           <button onclick="window.opener.editorApp.restoreVersion('${this.currentTab}', ${i})">Restore</button>
         </div><hr>`
      )
    })
    win.document.write('</body></html>')
    win.document.close()
  }

  restoreVersion(tab, index) {
    const historyKey = `history_${encodeURIComponent(tab)}`
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]')
    if (!history[index]) return
    const tabs = this.getTabs()
    if (!tabs[tab]) return
    tabs[tab].content = history[index].content
    localStorage.setItem('savedcontent', JSON.stringify(tabs))
    this.switchTab(tab)
    this.updateLineNumbers()
  }

  bindEvents() {
    this.saveBtn.onclick = () => this.saveFile()
    this.saveAsBtn.onclick = () => this.saveAs()
    this.openFileBtn.onclick = () => this.openFile()
    this.runHtmlBtn.onclick = () => this.runHtml()
    this.runJsBtn.onclick = () => this.runJs()
    this.runPythonBtn.onclick = () => this.runPython()
    this.viewHistoryBtn.onclick = () => this.viewHistory()
    this.settingsBtn.onclick = () => this.openSettingsTab()

    this.editor.addEventListener('input', () => {
      this.updateLineNumbers()
      const tabs = this.getTabs()
      if (this.currentTab && tabs[this.currentTab].language === 'html' && this.livePreviewVisible) {
        this.livePreview.srcdoc = this.editor.value
      }
    })
    this.editor.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.editor.scrollTop
    })

    this.langSelector.onchange = () => {
      const tabs = this.getTabs()
      if (this.currentTab && tabs[this.currentTab]) {
        tabs[this.currentTab].language = this.langSelector.value
        localStorage.setItem('savedcontent', JSON.stringify(tabs))
        this.switchTab(this.currentTab)
        this.showPopup('Language Saved!')
      }
    }

    this.togglePreviewBtn.onclick = () => this.toggleLivePreview()
  
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        this.saveFile()
      }
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        this.openFile()
      }
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        this.runHtml()
      }
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        this.runJs()
      }
      if (e.ctrlKey && e.key === '3') {
        e.preventDefault()
        this.runPython()
      }
      if (e.ctrlKey && e.key === 'Enter' && this.currentTab === 'Settings') {
        e.preventDefault()
        this.applyEditorSettingsFromText()
      }
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault()
        this.viewHistory()
      }
    })
  }

  init() {
    const tabs = this.getTabs()
    if (!tabs.default) {
      tabs.default = { content: '', path: null, language: 'text' }
      localStorage.setItem('savedcontent', JSON.stringify(tabs))
    }
    this.loadTabs()
    this.switchTab('default')
  }
}

// end of raw-editor.js: note we do NOT auto-instantiate EditorApp here.
