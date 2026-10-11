import "./index.css";
import { Composition } from "remotion";
import { Explainer, FPS, TOTAL } from "./Explainer";
import { ExplainerSquare, SQUARE_TOTAL } from "./ExplainerSquare";
import { Teaser, TEASER_TOTAL } from "./Teaser";
import { defaultProps } from "./data/props";
import { ProductDemo, DEMO_TOTAL } from "./ProductDemo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="PreflightExplainer" component={Explainer} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} />
    <Composition id="PreflightExplainerVertical" component={Explainer} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={defaultProps} />
    <Composition id="PreflightProductDemo" component={ProductDemo} durationInFrames={DEMO_TOTAL} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} />
    {/* social cuts: 1:1 explainer with burned-in captions, 30 s teasers in 16:9 and 9:16 */}
    <Composition id="PreflightExplainerSquare" component={ExplainerSquare} durationInFrames={SQUARE_TOTAL} fps={FPS} width={1080} height={1080} defaultProps={defaultProps} />
    <Composition id="PreflightTeaser16x9" component={Teaser} durationInFrames={TEASER_TOTAL} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} />
    <Composition id="PreflightTeaser9x16" component={Teaser} durationInFrames={TEASER_TOTAL} fps={FPS} width={1080} height={1920} defaultProps={defaultProps} />
  </>
);
