namespace PiCore;

using System.Diagnostics;
using System.Numerics;

public enum PiAlgorithm
{
    Leibniz,
    Nilakantha,
    GaussLegendre
}

public interface IPiCalculator
{
    double Compute(int iterations, IProgress<double>? progress = null, CancellationToken cancellationToken = default);
}

public static class PiCalculatorFactory
{
    public static IPiCalculator Create(PiAlgorithm algorithm)
    {
        return algorithm switch
        {
            PiAlgorithm.Leibniz => new LeibnizPiCalculator(),
            PiAlgorithm.Nilakantha => new NilakanthaPiCalculator(),
            PiAlgorithm.GaussLegendre => new GaussLegendrePiCalculator(),
            _ => throw new ArgumentOutOfRangeException(nameof(algorithm), algorithm, null)
        };
    }
}

public sealed class LeibnizPiCalculator : IPiCalculator
{
    public double Compute(int iterations, IProgress<double>? progress = null, CancellationToken cancellationToken = default)
    {
        double sum = 0.0;
        for (int i = 0; i < iterations; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            double term = ((i % 2 == 0) ? 1.0 : -1.0) / (2 * i + 1);
            sum += term;
            if (progress != null && (i & 0x3FFF) == 0) // update periodically
            {
                progress.Report((double)(i + 1) / iterations);
            }
        }
        progress?.Report(1.0);
        return 4.0 * sum;
    }
}

public sealed class NilakanthaPiCalculator : IPiCalculator
{
    public double Compute(int iterations, IProgress<double>? progress = null, CancellationToken cancellationToken = default)
    {
        // π = 3 + Σ_{n=1..∞} (-1)^{n+1} * 4 / ( (2n)*(2n+1)*(2n+2) )
        double pi = 3.0;
        double sign = 1.0;
        for (int n = 1; n <= iterations; n++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            double a = 2.0 * n;
            double term = 4.0 / (a * (a + 1.0) * (a + 2.0));
            pi += sign * term;
            sign = -sign;
            if (progress != null && (n & 0x1FFF) == 0)
            {
                progress.Report((double)n / iterations);
            }
        }
        progress?.Report(1.0);
        return pi;
    }
}

public sealed class GaussLegendrePiCalculator : IPiCalculator
{
    public double Compute(int iterations, IProgress<double>? progress = null, CancellationToken cancellationToken = default)
    {
        // Gauss-Legendre algorithm converges quadratically.
        // Using doubles; a handful of iterations yields ~15 digits.
        double a = 1.0;
        double b = 1.0 / Math.Sqrt(2.0);
        double t = 0.25;
        double p = 1.0;

        for (int i = 0; i < iterations; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            double an = (a + b) / 2.0;
            double bn = Math.Sqrt(a * b);
            double tn = t - p * Math.Pow(a - an, 2);
            double pn = 2.0 * p;

            a = an;
            b = bn;
            t = tn;
            p = pn;

            progress?.Report((double)(i + 1) / iterations);
        }

        double pi = Math.Pow(a + b, 2) / (4.0 * t);
        progress?.Report(1.0);
        return pi;
    }
}
