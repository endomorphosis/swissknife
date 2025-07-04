/**
 * Strudel Music App
 *
 * A web-based music creation tool using the Strudel REPL.
 * Integrates with the VibeCode desktop environment.
 */
window.StrudelApp = class StrudelApp {
    constructor(options) {
        this.options = options;
        this.container = options.container;
        this.container.innerHTML = `
            <div class="strudel-app" style="height: 100%; display: flex; flex-direction: column;">
                <div class="strudel-menu" style="padding: 5px; background-color: #f0f0f0; border-bottom: 1px solid #ccc;">
                    <button id="strudel-help-btn">Help</button>
                    <button id="strudel-examples-btn">Examples</button>
                </div>
                <div id="strudel-container" style="flex-grow: 1;"></div>
            </div>
        `;
        this.initStrudel();
    }

    initStrudel() {
        // This is a placeholder for the actual Strudel REPL initialization
        // In a real scenario, you would load the Strudel library and attach it to the container
        const strudelContainer = this.container.querySelector('#strudel-container');
        strudelContainer.innerHTML = `
            <div style="padding: 20px;">
                <h2>Strudel REPL would be here</h2>
                <p>This is a placeholder for the interactive music environment.</p>
                <p>Imagine making music with code right here!</p>
                <textarea style="width: 95%; height: 200px; margin-top: 10px; font-family: monospace;">// Your Strudel code here
stack(
    s("bd*4"),
    s("hh*8").every(2, rev),
    s("sn?").e(3,8)
).cpm(120)</textarea>
            </div>
        `;

        this.container.querySelector('#strudel-help-btn').addEventListener('click', () => {
            this.showHelp();
        });

        this.container.querySelector('#strudel-examples-btn').addEventListener('click', () => {
            this.showExamples();
        });
    }

    showHelp() {
        alert("Strudel Help\n\nThis is where you would see documentation for the Strudel music language.");
    }

    showExamples() {
        alert("Strudel Examples\n\nHere are some example patterns:\n\n- s('bd*4')\n- stack(s('bd*4'), s('hh*8'))\n- note('c4 a4 f4 g4').s('synth')");
    }

    destroy() {
        // Cleanup any resources if needed
        console.log("StrudelApp is being destroyed");
    }
}
