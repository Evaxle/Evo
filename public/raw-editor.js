/* Compact EditorApp — Monaco-enabled when available. Clean single-definition file. */
class EditorApp {
	constructor() {
		this.editor = document.getElementById('editor')
		this.tabsContainer = document.getElementById('tabs')
		this.lineNumbers = document.getElementById('lineNumbers')
		this.monacoContainer = document.getElementById('monacoContainer')

		this.currentTab = null
		this.monacoEnabled = false
		this.monacoEditor = null
		this.monacoModels = {}

		this.bindEvents()
		this.init()
	}

	getTabs() {
		return JSON.parse(localStorage.getItem('savedcontent') || '{}')
	}

	setupMonaco() {
		if (!window.require || !this.monacoContainer) return
		try {
			require.config({ paths: { vs: '/vs' } })
			const self = this
			require(['vs/editor/editor.main'], function () {
				self.monacoEditor = monaco.editor.create(self.monacoContainer, { value: '', language: 'text', automaticLayout: true })
				self.monacoEnabled = true
			})
		} catch (e) { console.warn('monaco init failed', e) }
	}

	loadTabs() {
		if (!this.tabsContainer) return
		this.tabsContainer.innerHTML = ''
		const tabs = this.getTabs()
		Object.keys(tabs).forEach(name => {
			const b = document.createElement('button')
			b.textContent = name
			b.onclick = () => this.switchTab(name)
			this.tabsContainer.appendChild(b)
		})
		const add = document.createElement('button')
		add.textContent = '+'
		add.onclick = () => {
			const name = prompt('New tab name')
			if (!name) return
			const t = this.getTabs()
			t[name] = { content: '', language: 'text', path: null }
			localStorage.setItem('savedcontent', JSON.stringify(t))
			this.loadTabs()
			this.switchTab(name)
		}
		this.tabsContainer.appendChild(add)
	}

	switchTab(name) {
		const tabs = this.getTabs()
		if (!tabs[name]) return
		this.currentTab = name
		const content = tabs[name].content || ''
		if (this.monacoEnabled && this.monacoEditor) {
			const uri = monaco.Uri.parse('inmemory://model/' + encodeURIComponent(name))
			let m = monaco.editor.getModel(uri)
			if (!m) m = monaco.editor.createModel(content, 'text', uri)
			this.monacoEditor.setModel(m)
		} else if (this.editor) {
			this.editor.value = content
			if (this.lineNumbers) this.updateLineNumbers()
		}
	}

	updateLineNumbers() {
		if (!this.lineNumbers || !this.editor) return
		const lines = this.editor.value.split('\n').length
		this.lineNumbers.innerHTML = ''
		for (let i = 1; i <= lines; i++) {
			const d = document.createElement('div')
			d.textContent = i
			this.lineNumbers.appendChild(d)
		}
	}

	bindEvents() {
		document.addEventListener('keydown', e => {
			if (e.ctrlKey && e.key === 's') { e.preventDefault(); this.saveFile && this.saveFile() }
		})
	}

	saveFile() {
		if (!this.currentTab) return
		const tabs = this.getTabs()
		const content = (this.monacoEnabled && this.monacoEditor) ? this.monacoEditor.getValue() : (this.editor ? this.editor.value : '')
		tabs[this.currentTab].content = content
		localStorage.setItem('savedcontent', JSON.stringify(tabs))
		this.showPopup('Saved')
	}

	showPopup(msg) {
		const p = document.createElement('div')
		p.className = 'popup'
		p.textContent = msg
		document.body.appendChild(p)
		setTimeout(() => p.remove(), 1200)
	}

	async commitToGitHub() {
		if (!this.currentTab) return
		const tabs = this.getTabs()
		const tab = tabs[this.currentTab]
		const content = tab.content || ''
		const repoFull = localStorage.getItem('evo_current_repo')
		if (!repoFull) { this.showPopup('No repo selected'); return }
		const [owner, repo] = repoFull.split('/')
		const branch = localStorage.getItem('evo_current_branch') || 'main'
		const path = tab.path || this.currentTab
		const message = 'Update from Evo'
		try {
			const token = localStorage.getItem('evo_token')
			const res = await fetch(`http://localhost:8080/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit`, {
				method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') },
				body: JSON.stringify({ path, content, message, branch })
			})
			if (!res.ok) { this.showPopup('Commit failed'); return }
			this.showPopup('Commit OK')
		} catch (e) { console.error(e); this.showPopup('Commit error') }
	}

	init() {
		const tabs = this.getTabs()
		if (!Object.keys(tabs).length) {
			tabs.default = { content: '', language: 'text' }
			localStorage.setItem('savedcontent', JSON.stringify(tabs))
		}
		this.loadTabs()
		this.setupMonaco()
		this.switchTab(Object.keys(tabs)[0])
	}
}

// Do not auto-instantiate here; pages can create EditorApp when ready.
