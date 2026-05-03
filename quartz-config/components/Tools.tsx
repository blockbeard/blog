import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Tools: QuartzComponent = ({ displayClass }: QuartzComponentProps) => (
  <div class={`tools ${displayClass ?? ""}`}>
    <h2>Tools</h2>
    <ul>
      <li>
        <a href="https://blockbeard.github.io/literary-generators/">Literary Generators</a>
      </li>
    </ul>
  </div>
)

Tools.css = `
.tools { margin-top: 1.5em; }
.tools h2 {
  font-size: 1em;
  margin: 0 0 0.4em 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray);
}
.tools ul { list-style: none; padding: 0; margin: 0; }
.tools li { padding: 2px 0; }
.tools a { color: var(--secondary); text-decoration: none; }
.tools a:hover { text-decoration: underline; }
`

export default (() => Tools) satisfies QuartzComponentConstructor
