// The lazy chunk: Chart.js plus only the pieces the Dashboard draws (a doughnut and stacked bars). The wrapper loads it
// with `import("./chart-lazy")`. It must stay a module with static named imports: `await import("chart.js")` and
// destructuring it does not tree-shake (it ships the whole library). Registration happens once, when it is evaluated.
import { ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, LinearScale, Tooltip } from "chart.js";

Chart.register(DoughnutController, BarController, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip);

export { Chart };
