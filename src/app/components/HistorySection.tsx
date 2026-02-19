import historyData from '../../data/history.json';

export function HistorySection() {
  const timeline = historyData;

  return (
    <section id="history" className="min-h-screen py-20 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* Section Title */}
          <div className="text-center mb-16">
            <h2 className="font-['Space_Grotesk'] text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400 mb-4">
              Our History
            </h2>
            <p className="font-['Inter'] text-lg text-gray-400">
              A journey through time and technology
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500 via-pink-500 to-purple-500"></div>

            <div className="space-y-12">
              {timeline.map((item, index) => (
                <div key={index} className={`relative flex ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-8`}>
                  {/* Year Badge */}
                  <div className="absolute left-8 md:left-1/2 transform md:-translate-x-1/2 z-10">
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-r ${item.color} flex items-center justify-center shadow-lg`}>
                      <span className="font-['Space_Grotesk'] font-bold text-white text-sm">{item.year}</span>
                    </div>
                  </div>

                  {/* Content Card */}
                  <div className={`w-full md:w-5/12 ml-24 md:ml-0 ${index % 2 === 0 ? 'md:mr-auto md:pr-16' : 'md:ml-auto md:pl-16'}`}>
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-['Space_Grotesk'] text-xl font-bold text-white">
                          {item.title}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-['Inter'] font-medium bg-gradient-to-r ${item.color} text-white`}>
                          {item.platform}
                        </span>
                      </div>
                      <p className="font-['Inter'] text-sm text-gray-400 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Message */}
          <div className="mt-16 text-center">
            <div className="max-w-3xl mx-auto bg-gradient-to-r from-pink-500/10 to-cyan-500/10 border border-pink-500/20 rounded-2xl p-8">
              <p className="font-['Inter'] text-lg text-gray-300 leading-relaxed">
                Our journey spanned over a decade of creativity, friendship, and pushing technical boundaries. 
                Though we've moved on to other endeavors, the legacy of our demos lives on in the hearts 
                of scene enthusiasts worldwide.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
