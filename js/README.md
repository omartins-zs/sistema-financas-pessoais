# Scripts da aplicação

Cada arquivo desta pasta contém uma parte contínua do antigo `script.js`, separado por responsabilidade e com seções de até aproximadamente 600 linhas. A ordem numérica é a ordem obrigatória de carregamento declarada no fim de `index.html`.

Por compatibilidade com o app existente, estes arquivos ainda são scripts clássicos: declarações globais compartilhadas permitem que os eventos e módulos existentes continuem funcionando sem uma conversão arriscada de todos os consumidores para imports/exports. `app-modules.js` é carregado depois de `80-bootstrap-pwa.js`.

Ao criar ou mover um arquivo, atualize `index.html`, a lista `SHELL` de `sw.js` e os testes de `tests/github-pages`. Não altere a ordem sem testes de inicialização cobrindo o fluxo local e o Firebase.
