'use client';

import Image from 'next/image';
import { Card, FraudPage } from '../../components/fraud/FraudUi';
import {
  PRODUCT_ABSTRACT,
  PRODUCT_ADVANCED_POSITIONING,
  PRODUCT_CREDITS,
  PRODUCT_DIFFERENTIATOR,
  PRODUCT_NAME,
  PRODUCT_PROBLEM_STATEMENT,
  PRODUCT_VIVA_ANSWER,
  PRODUCT_WHY_BUILT,
} from '../../lib/fraud/content';

const CORE_FEATURES = [
  'Dataset ingestion',
  'Anomaly detection',
  'Rule-based risk scoring',
  'Derived fraud labels',
  'Suspicious transaction investigation',
  'Case management',
  'Audit logging',
  'Fraud report generation',
];

const TECH_STACK = [
  { label: 'Frontend', value: 'Next.js application with server-backed fraud workflow pages and chart-driven investigation UI.' },
  { label: 'Backend', value: 'Node.js server routes running inside the Next.js app, used as the fraud API and BFF layer.' },
  { label: 'Analysis engine', value: 'Hybrid anomaly + rule detection with derived risk labels, explainability, and case generation.' },
  { label: 'Data pipeline', value: 'Server-side chunked upload, staged files, streaming CSV processing, and aggregated dataset summaries.' },
  { label: 'Worker system', value: 'Detached background job runner for parse, analysis, and report generation.' },
];

const WORKFLOW_STEPS = [
  'Upload dataset',
  'Run detection',
  'Review suspicious transactions',
  'Create cases',
  'Generate investigation reports',
];

const DIFFERENTIATORS = [
  'Hybrid anomaly + rule detection',
  'Explainable fraud analysis',
  'Investigator-focused UI',
  'Case workflow integration',
  'Operational fraud reporting',
];

const SCALE_ITEMS = [
  'Large dataset ingestion',
  'Chunked uploads',
  'Background analysis jobs',
  'Paged results',
  'Aggregated analytics',
];

const FLOW_STEPS = [
  'Dataset Upload',
  'Parsing',
  'Fraud Detection Engine',
  'Suspicious Transactions',
  'Case Investigation',
  'Report Generation',
];

const SCREENSHOTS = [
  { title: 'Dashboard', src: '/about-dashboard.png', alt: 'Fraud Ops Risk Console dashboard screenshot' },
  { title: 'Fraud Detection', src: '/about-fraud-detection.png', alt: 'Fraud detection investigation workspace screenshot' },
  { title: 'Cases', src: '/about-cases.png', alt: 'Fraud case management screenshot' },
];

export default function AboutPage() {
  return (
    <FraudPage eyebrow="ABOUT THE PLATFORM" title={PRODUCT_NAME} description={PRODUCT_VIVA_ANSWER}>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4">
          <Card className="p-6">
            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300">Platform Overview</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{PRODUCT_ABSTRACT}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-slate-100">Product Summary</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{PRODUCT_VIVA_ANSWER}</div>
                <div className="mt-4 border-t border-white/10 pt-4 text-sm text-slate-300">{PRODUCT_CREDITS[0]}</div>
                <div className="mt-1 text-sm text-slate-300">{PRODUCT_CREDITS[1]}</div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm font-semibold text-slate-100">Architecture</div>
            <div className="mt-2 text-sm text-slate-400">The platform is structured as a fraud operations pipeline that moves from staged ingestion to explainable investigation outcomes.</div>
            <div className="mt-5 grid gap-3 xl:grid-cols-6">
              {FLOW_STEPS.map((step, index) => (
                <div key={step} className="relative rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-100">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</div>
                  <div className="mt-2 font-semibold">{step}</div>
                  {index < FLOW_STEPS.length - 1 ? <div className="pointer-events-none absolute right-[-10px] top-1/2 hidden h-[2px] w-5 -translate-y-1/2 bg-sky-400/50 xl:block" /> : null}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 xl:col-span-6 space-y-4">
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">Core Features</div>
                <ul className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  {CORE_FEATURES.map((item) => <li key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">{item}</li>)}
                </ul>
              </Card>

              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">Fraud Investigation Workflow</div>
                <div className="mt-4 space-y-2">
                  {WORKFLOW_STEPS.map((step, index) => (
                    <div key={step} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <span className="mr-2 text-slate-400">{index + 1}.</span>
                      {step}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="col-span-12 xl:col-span-6 space-y-4">
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">Technology Stack</div>
                <div className="mt-4 space-y-3">
                  {TECH_STACK.map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-300">{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">Performance and Scale</div>
                <ul className="mt-4 grid gap-2 text-sm text-slate-300">
                  {SCALE_ITEMS.map((item) => <li key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">{item}</li>)}
                </ul>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 xl:col-span-4">
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">Problem Statement</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{PRODUCT_PROBLEM_STATEMENT}</div>
              </Card>
            </div>
            <div className="col-span-12 xl:col-span-4">
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">Why We Built It</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{PRODUCT_WHY_BUILT}</div>
              </Card>
            </div>
            <div className="col-span-12 xl:col-span-4">
              <Card className="p-6">
                <div className="text-sm font-semibold text-slate-100">How It Is Different</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{PRODUCT_DIFFERENTIATOR}</div>
              </Card>
            </div>
          </div>

          <Card className="p-6">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="text-sm font-semibold text-slate-100">Why It Is More Advanced Than Others</div>
                <div className="mt-3 text-sm leading-6 text-slate-300">{PRODUCT_ADVANCED_POSITIONING}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100">Product Differentiators</div>
                <ul className="mt-3 grid gap-2 text-sm text-slate-300">
                  {DIFFERENTIATORS.map((item) => <li key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">{item}</li>)}
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm font-semibold text-slate-100">Platform Screens</div>
            <div className="mt-2 text-sm text-slate-400">Live product captures from the current Fraud Ops Risk Console workflow.</div>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {SCREENSHOTS.map((shot) => (
                <div key={shot.title} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-slate-100">{shot.title}</div>
                  <div className="relative aspect-[16/10]">
                    <Image src={shot.src} alt={shot.alt} fill className="object-cover" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </FraudPage>
  );
}
