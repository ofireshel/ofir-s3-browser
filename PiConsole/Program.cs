using PiCore;

if (args.Length == 0 || args.Contains("--help") || args.Contains("-h"))
{
    Console.WriteLine("PiConsole - calculate π using various algorithms");
    Console.WriteLine("Usage: PiConsole [--algo leibniz|nilakantha|gauss] [--iters N]");
    Console.WriteLine("Defaults: --algo gauss --iters 5");
    return;
}

PiAlgorithm algorithm = PiAlgorithm.GaussLegendre;
int iterations = 5;

for (int i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--algo":
            if (i + 1 >= args.Length) throw new ArgumentException("Missing value for --algo");
            string name = args[++i].Trim().ToLowerInvariant();
            algorithm = name switch
            {
                "leibniz" => PiAlgorithm.Leibniz,
                "nilakantha" => PiAlgorithm.Nilakantha,
                "gauss" or "gausslegendre" or "gauss-legendre" => PiAlgorithm.GaussLegendre,
                _ => throw new ArgumentException($"Unknown algorithm '{name}'")
            };
            break;
        case "--iters":
            if (i + 1 >= args.Length) throw new ArgumentException("Missing value for --iters");
            if (!int.TryParse(args[++i], out iterations) || iterations <= 0)
            {
                throw new ArgumentException("--iters must be a positive integer");
            }
            break;
        default:
            throw new ArgumentException($"Unknown argument '{args[i]}'");
    }
}

var calculator = PiCalculatorFactory.Create(algorithm);
var progress = new Progress<double>(p => { /* could print progress */ });

var sw = System.Diagnostics.Stopwatch.StartNew();
double pi = calculator.Compute(iterations, progress);
sw.Stop();

Console.WriteLine($"Algorithm: {algorithm}");
Console.WriteLine($"Iterations: {iterations}");
Console.WriteLine($"π ≈ {pi:R}");
Console.WriteLine($"Elapsed: {sw.ElapsedMilliseconds} ms");
