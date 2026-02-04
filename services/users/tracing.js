const opentelemetry = require('@opentelemetry/sdk-node');
const { AlwaysOnSampler } = require('@opentelemetry/sdk-trace-base');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const exporter = new OTLPTraceExporter({
  url: 'http://jaeger:4317',
});

const sdk = new opentelemetry.NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME,
  }),
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
  sampler: new AlwaysOnSampler()
});

sdk.start();
