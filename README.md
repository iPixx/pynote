# pyNote 🧠

**A simple, local-first, and private AI-powered note-taking application.**

pyNote is an open-source project to build a minimal and intelligent markdown editor. It runs entirely on your local machine, ensuring your data remains **private**. Our core mission is to explore how local AI can enhance personal knowledge management without relying on cloud services.

Please note that this project is mainly meant to be a **learning experience**. It is not yet a fully functional application, but rather a work in progress.

We are also not yet proficient in managing a GitHub project, so please bear with us as we figure out the best way to organize issues, pull requests, and documentation.

Please do not be surprised if some contributions will be done by AI assistants or by using AI, as we are experimenting with how AI can assist in software development.

Help, feedback, and contributions are very welcome! If you have any questions or suggestions, please open an issue or submit a pull request.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

![Note Screenshot Placeholder](https://i.imgur.com/gY5zP0T.png)
_(This is a placeholder image. We need a real one once the UI is built!)_

---

### ✨ Core Features

- 📝 **Local-First Markdown:** Manage a "vault" of markdown files directly from your local folder.
- 🔐 **100% Private:** No cloud sync, no tracking, no data ever leaves your machine.
- 🧠 **AI Knowledge Weaver:** Uses local text embeddings to find and suggest links between your notes as you write.
- ✍️ **AI Creative Assistant:** Employs a local LLM (via Ollama) to help you expand on ideas, rephrase sentences, and generate text based on the context of your notes.
- 💻 **Cross-Platform:** Built with Electron, runs on Windows, macOS, and Linux.

### 🚀 Project Roadmap

This project is being built in phases. Our goal is to create a solid foundation first and then add layers of intelligence.

#### ✅ **Phase 1: The Core Editor (MVP)**

The focus of this phase is to build a usable, standalone markdown editor.

- [ ] **Vault Management:** Select and open a local folder as your note vault.
- [ ] **File Tree:** Display a list of all `.md` files in the vault.
- [ ] **Markdown Editor:** A robust editor with syntax highlighting (using CodeMirror).
- [ ] **Live Preview:** Rendered view of the markdown file.
- [ ] **File Operations:** Create, read, update, and save notes.

#### 🎯 **Phase 2: The Knowledge Weaver (AI-Powered Retrieval)**

In this phase, we make the application "smart" by helping the user discover connections within their own knowledge base.

- [ ] **Note Indexing:** On startup or command, scan all notes and generate text embeddings for each paragraph.
- [ ] **Local Vector Store:** Store these embeddings locally in a simple file (`index.json`).
- [ ] **Real-time Suggestions:** As the user types, generate an embedding for the current text and find the most semantically similar notes from the index.
- [ ] **Suggestion UI:** Display a list of related notes in a sidebar panel.

#### 🎯 **Phase 3: The Creative Assistant (Generative AI)**

This phase integrates a local Large Language Model (LLM) to turn pyNote into a creative partner. This requires the user to have [Ollama](https://ollama.com/) installed and running.

- [ ] **Ollama Integration:** Connect to the local Ollama API (`http://localhost:11434`).
- [ ] **Context-Aware Prompting (RAG):** Implement Retrieval-Augmented Generation. When a user asks to expand text, first find relevant notes (using Phase 2's system) and feed them to the LLM as context.
- [ ] **Text Generation UI:** Add context-menu actions like "Expand on this," "Summarize selection," or "Rephrase in a different tone."
- [ ] **Streaming Responses:** Display the LLM's generated text token-by-token for a better user experience.

### 🛠️ Technology Stack

- **Framework:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React](https://reactjs.org/)
- **Editor Component:** [CodeMirror 6](https://codemirror.net/)
- **AI (Embeddings):** [Transformers.js](https://huggingface.co/docs/transformers.js)
- **AI (Generative):** [Ollama](https://ollama.com/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)

### 🚀 Getting Started

Interested in running the project locally or contributing? Follow these steps:

1.  **Fork and Clone the repository:**

    ```bash
    git clone [https://github.com/iPixx/pynote.git](https://github.com/iPixx/pynote.git)
    cd pynote
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Run the application in development mode:**
    ```bash
    npm start
    ```

### 🤝 How to Contribute

We welcome contributions of all kinds! Whether it's reporting a bug, suggesting a feature, or writing code, your help is appreciated.

Please read our [**CONTRIBUTING.md**](CONTRIBUTING.md) guide to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

To create a welcoming and inclusive community, we expect all contributors to adhere to our [**Code of Conduct**](CODE_OF_CONDUCT.md).

### 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
