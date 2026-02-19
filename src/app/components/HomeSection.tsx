import logo from '../../assets/Dexion - What glory is all about.png';
import { ArrowDown } from 'lucide-react';

export function HomeSection() {
  return (
    <section id="home" className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black"></div>
      
      {/* Animated Grid */}
      <div className="absolute inset-0 opacity-20">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            animation: 'gridMove 20s linear infinite'
          }}
        />
      </div>

      {/* Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pink-500/30 rounded-full blur-[128px] animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/30 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          {/* Logo */}
          <div className="mb-8 animate-fadeIn">
            <img 
              src={logo} 
              alt="Dexion" 
              className="w-full max-w-2xl mx-auto h-auto object-contain drop-shadow-[0_0_50px_rgba(236,72,153,0.5)]"
            />
          </div>

          {/* Tagline */}
          <div className="space-y-4 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
            <h2 className="font-['Space_Grotesk'] text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400">
              Pioneering Demo Group
            </h2>
            <p className="font-['Inter'] text-xl md:text-2xl text-gray-400">
              C64 & Amiga Demoscene Legacy
            </p>
            <p className="font-['Inter'] text-lg text-gray-500">
              1982 - 1995
            </p>
          </div>

          {/* Description */}
          <div className="max-w-3xl mx-auto animate-fadeIn" style={{ animationDelay: '0.4s' }}>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <p className="font-['Inter'] text-lg text-gray-300 leading-relaxed">
                Welcome to the digital archive of Dexion, a pioneering demo group from the golden era 
                of home computing. We pushed the boundaries of Commodore 64 and Amiga hardware, 
                creating mesmerizing graphics, music, and effects that defined a generation.
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 animate-fadeIn" style={{ animationDelay: '0.6s' }}>
            <div className="bg-gradient-to-br from-pink-500/10 to-orange-500/10 border border-pink-500/20 rounded-xl p-6 hover:scale-105 transition-transform duration-300">
              <div className="font-['Space_Grotesk'] text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-orange-400">
                50+
              </div>
              <div className="font-['Inter'] text-sm text-gray-400 mt-2">Demos Released</div>
            </div>
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-6 hover:scale-105 transition-transform duration-300">
              <div className="font-['Space_Grotesk'] text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                12
              </div>
              <div className="font-['Inter'] text-sm text-gray-400 mt-2">Competition Wins</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6 hover:scale-105 transition-transform duration-300">
              <div className="font-['Space_Grotesk'] text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                8
              </div>
              <div className="font-['Inter'] text-sm text-gray-400 mt-2">Core Members</div>
            </div>
            <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl p-6 hover:scale-105 transition-transform duration-300">
              <div className="font-['Space_Grotesk'] text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
                13
              </div>
              <div className="font-['Inter'] text-sm text-gray-400 mt-2">Years Active</div>
            </div>
          </div>

          {/* Scroll Indicator */}
          <div className="mt-16 animate-bounce">
            <ArrowDown className="w-8 h-8 text-cyan-400 mx-auto" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gridMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(50px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
      `}</style>
    </section>
  );
}
