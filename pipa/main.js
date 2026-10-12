import vertShaderSrc from './kite.vert.js';
import fragShaderSrc from './kite.frag.js';
import WebGPU from '../lib/webgpu.js';
import {
    createIdentityMat4,
    createLookAtMat4,
    createOrthographicMat4,
    createRotationZMat4,
    createTranslationMat4,
    multiplyMat4,
} from '../lib/utils.js';

class Scene {
    constructor(gpu) {
        this.tempo = 0;

        this.program = gpu.createProgram(vertShaderSrc, fragShaderSrc);

        // as 4 formas da cena: 2 triangulos da pipa e 2 fitas da cauda
        // (cada triangulo esta em volta do ponto onde ele gira)
        const vermelho = [0.93, 0.1, 0.14, 1.0];
        const amarelo = [1.0, 0.85, 0.18, 1.0];
        const laranja = [1.0, 0.5, 0.1, 1.0];

        this.formas = [
            this.createTriangle([[0.0, 1.88], [-1.5, 0.39], [0.0, -1.87]], vermelho, gpu),
            this.createTriangle([[0.0, 1.88], [0.0, -1.87], [1.52, 0.39]], amarelo, gpu),
            this.createTriangle([[0.0, 0.0], [0.78, -0.6], [0.16, -0.96]], laranja, gpu),
            this.createTriangle([[0.01, -0.02], [0.83, -0.64], [0.23, -1.02]], laranja, gpu),
        ];
    }

    createTriangle(pontos, cor, gpu) {
        const positions = [];
        const colors = [];

        for (const p of pontos) {
            positions.push(p[0], p[1], 0.0, 1.0);
            colors.push(...cor);
        }

        return {
            shape: gpu.createShape([positions, colors], 3),
            uniform: gpu.createUniform(this.program, createIdentityMat4()),
        };
    }

    createModelMatrices() {
        this.tempo += 0.016;
        const t = this.tempo;

        // pipa sobe e desce e gira um pouco
        this.subida = 0.9 * Math.sin(t * 1.1);
        const anguloPipa = 0.16 * Math.sin(t * 1.1 + 0.9);

        const translatePipa = createTranslationMat4(1.22, 1.17 + this.subida, 0);
        const rotatePipa = createRotationZMat4(anguloPipa);
        const modeloPipa = multiplyMat4(translatePipa, rotatePipa);

        // fita 1 fica presa na ponta de baixo da pipa
        const anguloFita1 = -anguloPipa * 0.8 + 0.35 * Math.sin(t * 2.6 - 1.0);
        const pontaPipa = createTranslationMat4(0.0, -1.87, 0);
        let modeloFita1 = multiplyMat4(modeloPipa, pontaPipa);
        modeloFita1 = multiplyMat4(modeloFita1, createRotationZMat4(anguloFita1));

        // fita 2 fica presa na fita 1
        const anguloFita2 = 0.55 * Math.sin(t * 3.4 - 2.0);
        const pontaFita1 = createTranslationMat4(0.47, -0.78, 0);
        let modeloFita2 = multiplyMat4(modeloFita1, pontaFita1);
        modeloFita2 = multiplyMat4(modeloFita2, createRotationZMat4(anguloFita2));

        return [modeloPipa, modeloPipa, modeloFita1, modeloFita2];
    }

    createViewMatrix() {
        // a camera segue so uma parte da subida da pipa
        const y = 0.4 * this.subida;
        const eye = [0, y, 1];
        const at = [0, y, 0];
        const up = [0, 1, 0];

        return createLookAtMat4(eye, at, up, true);
    }

    createProjectionMatrix() {
        const aspect = 900 / 600;
        return createOrthographicMat4(-5.12 * aspect, 5.12 * aspect, -5.12, 5.12, 0.1, 10);
    }

    draw(gpu) {
        const models = this.createModelMatrices();
        const view = this.createViewMatrix();
        const projection = this.createProjectionMatrix();

        for (let i = 0; i < this.formas.length; i++) {
            const forma = this.formas[i];

            // o objeto passa por model, depois view e, por fim, projection.
            const modelView = multiplyMat4(view, models[i]);
            forma.uniform.data.set(multiplyMat4(projection, modelView));
            gpu.writeBuffer(forma.uniform.buffer, forma.uniform.data);
            gpu.draw(this.program, forma.shape, [forma.uniform.bindGroup]);
        }
    }
}

class Main {
    async init() {
        // fundo do ceu com uma cor so
        this.gpu = await WebGPU.createCanvas('#glcanvas', 900, 600, {
            depth: false,
            clearColor: { r: 0.59, g: 0.84, b: 0.99, a: 1 },
        });
        this.scene = new Scene(this.gpu);
    }

    draw() {
        this.gpu.start();
        this.scene.draw(this.gpu);
        this.gpu.finish();
        requestAnimationFrame(this.draw.bind(this));
    }
}

try {
    const app = new Main();
    await app.init();
    app.draw();
} catch (error) {
    console.error(error);
    document.body.insertAdjacentHTML('beforeend', `<p>${error.message}</p>`);
}
