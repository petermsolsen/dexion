import { Calendar, Monitor, User } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import worksData from '../../data/works.json';

export function WorksSection() {
  const works = worksData;

  return (
    <section id="works" className="min-h-screen py-20 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Section Title */}
          <div className="text-center mb-16">
            <h2 className="font-['Space_Grotesk'] text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400 mb-4">
              Our Works
            </h2>
            <p className="font-['Inter'] text-lg text-gray-400">
              A showcase of our productions and releases
            </p>
          </div>

          {/* Works Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {works.map((work, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all duration-300 hover:scale-105 group">
                {/* Image */}
                <div className="relative h-48 bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden">
                  <ImageWithFallback
                    src={`https://images.unsplash.com/photo-1618172193622-ae2d025f4032?w=400&q=80`}
                    alt={work.title}
                    className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-300"
                    fallbackText={work.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                  
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-['Inter'] font-medium bg-gradient-to-r ${work.gradient} text-white`}>
                      {work.platform}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-['Inter'] font-medium bg-black/60 backdrop-blur-sm text-white">
                      {work.type}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-['Space_Grotesk'] text-xl font-bold text-white">
                      {work.title}
                    </h3>
                    <div className="flex items-center gap-1 text-gray-400">
                      <Calendar size={14} />
                      <span className="font-['Inter'] text-sm">{work.year}</span>
                    </div>
                  </div>

                  <p className="font-['Inter'] text-sm text-gray-400 leading-relaxed mb-4">
                    {work.description}
                  </p>

                  {/* Credits */}
                  <div className="space-y-2 pt-4 border-t border-white/10">
                    {work.credits.map((credit, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <User size={14} className="flex-shrink-0 mt-0.5 text-cyan-400" />
                        <span className="font-['Inter'] text-xs text-gray-500">
                          {credit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Info */}
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-pink-500/10 to-cyan-500/10 border border-pink-500/20 rounded-2xl p-8 text-center">
              <Monitor className="w-16 h-16 text-cyan-400 mx-auto mb-6" />
              <p className="font-['Inter'] text-lg text-gray-300 leading-relaxed mb-4">
                All our demos are preserved in digital archives and available through
                sites like Pouet.net and CSDb. The spirit of the demoscene lives on!
              </p>
              <div className="inline-block px-6 py-3 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-lg">
                <span className="font-['Space_Grotesk'] font-bold text-white">
                  Greetings to all sceners worldwide
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
