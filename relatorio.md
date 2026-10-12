# Relatório – Pipa animada em WebGPU

## 1. Visão geral

O trabalho é uma cena 2D animada de uma pipa voando sobre um céu de cor sólida, feita com WebGPU e shaders WGSL. A cena usa apenas quatro triângulos, sem texturas, imagens externas ou bibliotecas de renderização. O código segue a estrutura dos exemplos feitos em sala:

```
lib/
  utils.js       funções de matriz (identidade, translação, rotação, lookAt, ortográfica, multiplicação)
  webgpu.js      classe GPUCanvas (pipeline, buffers, uniforms, render pass)
pipa/
  main.html      página com o canvas
  main.css       estilo do canvas
  kite.vert.js   vertex shader (WGSL)
  kite.frag.js   fragment shader (WGSL)
  main.js        classes Scene e Main (cena, matrizes e animação)
```

Para executar, abre-se `pipa/main.html` por um servidor local (por exemplo, a extensão Live Server do VS Code), pois os arquivos usam módulos ES.

## 2. Modelagem da cena

### 2.1 Triângulos

A cena tem exatamente quatro triângulos:

| Triângulo | Cor | Função |
|---|---|---|
| 1 | vermelho | metade esquerda da pipa |
| 2 | amarelo | metade direita da pipa |
| 3 | laranja | primeira fita da cauda |
| 4 | laranja | segunda fita da cauda |

A pipa é um losango dividido por uma linha vertical em dois triângulos que compartilham o vértice do topo e o da base. As coordenadas foram tiradas da imagem de referência, usando a escala 100 pixels = 1 unidade do mundo e o eixo y apontando para cima. O centro da pipa é a origem do seu sistema de coordenadas local:

- Topo: (0,00; 1,88)
- Esquerda: (-1,50; 0,39)
- Direita: (1,52; 0,39)
- Base: (0,00; -1,87)

Os triângulos são:

- vermelho: topo, esquerda, base;
- amarelo: topo, base, direita.

### 2.2 Coordenadas locais ao ponto de rotação

Cada triângulo é definido em torno do ponto em que ele gira. Isso simplifica as transformações, porque a rotação é feita direto sobre esse ponto, sem precisar mover o objeto para a origem e voltar.

- A pipa gira em torno do seu centro.
- A fita 1 gira em torno do vértice da base da pipa, onde está presa. Seus vértices são (0; 0), (0,78; -0,60) e (0,16; -0,96).
- A fita 2 gira em torno de um ponto da borda da fita 1, o ponto médio do lado externo. Seus vértices são (0,01; -0,02), (0,83; -0,64) e (0,23; -1,02).

### 2.3 Dados enviados à GPU

Para cada triângulo foram criados dois vertex buffers, como no código de sala: um com posições (`vec4`, com z = 0 e w = 1) e outro com cores (`vec4`, a mesma cor nos três vértices). A cor do céu é a cor de limpeza (`clearColor`) do render pass. Como a cena é 2D e os triângulos não se sobrepõem, o teste de profundidade foi desligado (`depth: false`).

## 3. Shaders

O vertex shader (`kite.vert.js`) recebe posição e cor e multiplica a posição pela matriz do uniform buffer:

```wgsl
struct Uniforms {
  modelViewProjection : mat4x4f,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

output.position = uniforms.modelViewProjection * position;
output.color = color;
```

O fragment shader (`kite.frag.js`) apenas devolve a cor interpolada. Cada triângulo tem seu próprio uniform buffer, com a matriz MVP já calculada no JavaScript.

## 4. Transformações

### 4.1 Matriz de modelagem

As matrizes são 4x4, em ordem column-major, criadas pelas funções de `lib/utils.js`. A cena forma uma hierarquia: a fita 2 depende da fita 1, que depende da pipa. Para isso, a matriz de modelagem de cada filho é a do pai multiplicada pela transformação local do filho:

```
Mpipa  = T(posição + subida) · Rz(anguloPipa)
Mfita1 = Mpipa  · T(base da pipa)       · Rz(anguloFita1)
Mfita2 = Mfita1 · T(ponto de fixação 2) · Rz(anguloFita2)
```

Com isso, qualquer movimento da pipa é herdado pelas fitas, e a fita 2 também acompanha a fita 1. O resultado é um movimento coerente.

Os triângulos vermelho e amarelo usam a mesma matriz `Mpipa`, então se movem juntos como um único corpo.

### 4.2 Matriz final

Para cada triângulo, o código calcula:

```
MVP = Projeção · Visão · Modelo
```

A matriz é copiada para o uniform buffer do triângulo a cada quadro, com `writeBuffer`. A ordem é a mesma do exemplo de sala: o objeto passa primeiro pela modelagem, depois pela câmera e por fim pela projeção.

## 5. Animação

A animação roda em `requestAnimationFrame`. A cada quadro uma variável de tempo `t` avança 0,016 (o que corresponde a cerca de 60 quadros por segundo) e alimenta funções seno.

### 5.1 Movimento vertical

```
subida = 0,9 · sen(1,1 · t)
```

A pipa sobe e desce continuamente com amplitude de 0,9 unidade. A subida entra na componente y da translação, a partir da posição de repouso (1,22; 1,17).

### 5.2 Rotação

```
anguloPipa = 0,16 · sen(1,1 · t + 0,9)
```

A pipa gira em torno do eixo z, entre cerca de -9° e +9°, que é uma rotação leve. Ela usa a mesma frequência da subida e uma fase deslocada. Assim a pipa se inclina de forma suave, ligeiramente fora de sincronia com a altura, o que parece mais natural.

### 5.3 Cauda

```
anguloFita1 = -0,8 · anguloPipa + 0,35 · sen(2,6 · t - 1,0)
anguloFita2 = 0,55 · sen(3,4 · t - 2,0)
```

As fitas se movem de forma diferente da pipa, mas coerente com ela:

- Como pertencem à hierarquia, herdam a subida e a rotação da pipa.
- A fita 1 tem um termo que se opõe à rotação da pipa (`-0,8 · anguloPipa`), como se fosse arrastada pelo ar. Ela soma uma oscilação própria, mais rápida.
- A fita 2 oscila com frequência ainda maior (3,4) e fase diferente. Como as frequências das três partes são distintas, o movimento da ponta da cauda parece o de uma fita solta.

## 6. Câmera

A matriz de visão é criada com `createLookAtMat4`. A câmera fica em `z = 1`, olhando para `z = 0`, com `up = (0, 1, 0)`:

```
y = 0,4 · subida
eye = (0, y, 1)    at = (0, y, 0)    up = (0, 1, 0)
```

A câmera acompanha apenas 40% do movimento vertical da pipa. Assim, a pipa continua se movendo na tela, com 60% da amplitude original (cerca de 0,54 unidade), mas o movimento é mais suave do que se a câmera estivesse fixa e a pipa saísse do enquadramento. Se a câmera acompanhasse 100%, a pipa pareceria parada.

## 7. Projeção ortográfica

A projeção é criada com `createOrthographicMat4`, para o intervalo de profundidade [0, 1] do WebGPU:

```
left = -5,12 · aspecto   right = 5,12 · aspecto
bottom = -5,12           top = 5,12
near = 0,1               far = 10
aspecto = 900 / 600 = 1,5
```

O volume de visualização é, portanto, uma região de 15,36 × 10,24 unidades. A proporção é a mesma do canvas (900 × 600), então a pipa não fica deformada. Como a projeção é ortográfica, o tamanho dos objetos não depende da distância à câmera, o que combina com uma cena 2D.

## 8. Requisitos atendidos

| Requisito | Como foi atendido |
|---|---|
| WebGPU e shaders WGSL | `kite.vert.js` e `kite.frag.js`, via `lib/webgpu.js` |
| Somente 4 triângulos | `Scene.formas` contém 4 triângulos |
| Sem textura, imagens ou bibliotecas | só `lib/` do curso |
| Buffers de vértices | posição e cor, por triângulo |
| Uniform buffers | um por triângulo, com a matriz MVP |
| Matrizes de modelagem, câmera e projeção | `createModelMatrices`, `createViewMatrix`, `createProjectionMatrix` |
| Pipa sobe e desce, com leve rotação | seções 5.1 e 5.2 |
| Fitas com movimento diferente, mas coerente | seção 5.3 |
| Câmera acompanha parcialmente | seção 6 (40%) |
| Projeção ortográfica | seção 7 |
| Animação com `requestAnimationFrame` | classe `Main`, método `draw` |

## 9. Conclusão

A cena mostra o uso das transformações geométricas e do pipeline de visualização estudados em sala: modelagem hierárquica (pipa e fitas), câmera com `lookAt`, projeção ortográfica e animação contínua. A hierarquia entre os triângulos faz a cauda acompanhar a pipa sem precisar calcular manualmente a posição de cada fita.
