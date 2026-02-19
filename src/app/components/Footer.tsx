import logo from '../../assets/Dexion - What glory is all about.png';

export function Footer() {
  return (
    <footer className="bg-black border-t border-white/10 py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-8">
            {/* Left Column */}
            <div className="space-y-6">
              <img 
                src={logo} 
                alt="Dexion" 
                className="h-16 w-auto object-contain"
              />
              <p className="font-['Inter'] text-gray-400 leading-relaxed">
                A pioneering demo group from the golden era of home computing. 
                Pushing boundaries on C64 and Amiga from 1982 to 1995.
              </p>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-bold text-white mb-3">
                  Platforms
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                    <span className="font-['Inter'] text-sm text-gray-400">Commodore 64 (1982-1987)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-500"></div>
                    <span className="font-['Inter'] text-sm text-gray-400">Commodore Amiga (1987-1995)</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-bold text-white mb-3">
                  Greetings
                </h3>
                <p className="font-['Inter'] text-sm text-gray-400 leading-relaxed">
                  To all crews who kept the scene alive • All coders, musicians & graphicians • 
                  Party organizers • And everyone who appreciated our work
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8"></div>

          {/* Bottom Row */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="font-['Inter'] text-sm text-gray-500 text-center md:text-left">
              This site is a tribute to the golden age of demoscene
            </p>
            <div className="px-6 py-2 bg-gradient-to-r from-pink-500/20 to-cyan-500/20 border border-pink-500/30 rounded-lg">
              <span className="font-['Space_Grotesk'] font-bold text-sm text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400">
                Keep the Scene Alive
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
