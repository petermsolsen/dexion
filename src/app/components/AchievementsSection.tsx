import { Trophy, Award, Users, Star, Zap, Target } from 'lucide-react';
import awardsData from '../../data/awards.json';

export function AchievementsSection() {
  const awards = awardsData;

  const stats = [
    { icon: Trophy, label: 'Competition Wins', value: '12', gradient: 'from-yellow-500 to-orange-500' },
    { icon: Award, label: 'Demos Released', value: '50+', gradient: 'from-pink-500 to-purple-500' },
    { icon: Users, label: 'Core Members', value: '8', gradient: 'from-cyan-500 to-blue-500' },
    { icon: Star, label: 'Scene Rating', value: '9.2/10', gradient: 'from-orange-500 to-red-500' }
  ];

  const achievements = [
    { text: 'First crew to implement full 3D texture mapping on Amiga 500', icon: Zap },
    { text: 'Pioneered synchronized music-visual transitions in demos', icon: Target },
    { text: 'Created one of the most optimized raster routines on C64', icon: Zap },
    { text: 'Collaborated with legendary musicians: Jeroen Tel, Chris Huelsbeck', icon: Users },
    { text: 'Featured in Commodore Format and Amiga Format magazines', icon: Award },
    { text: 'Hosted at Museum of Modern Computing (2018 retrospective)', icon: Trophy }
  ];

  return (
    <section id="achievements" className="min-h-screen py-20 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900 to-black"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-7xl mx-auto space-y-16">
          {/* Section Title */}
          <div className="text-center">
            <h2 className="font-['Space_Grotesk'] text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400 mb-4">
              Achievements
            </h2>
            <p className="font-['Inter'] text-lg text-gray-400">
              Recognition and milestones throughout our journey
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 text-center hover:bg-white/10 transition-all duration-300 hover:scale-105">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r ${stat.gradient} flex items-center justify-center`}>
                  <stat.icon className="w-8 h-8 text-white" />
                </div>
                <div className={`font-['Space_Grotesk'] text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${stat.gradient} mb-2`}>
                  {stat.value}
                </div>
                <div className="font-['Inter'] text-sm text-gray-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Competition Awards */}
          <div>
            <h3 className="font-['Space_Grotesk'] text-2xl font-bold text-white mb-8 text-center">
              Competition Awards
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {awards.map((award, index) => (
                <div key={index} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-all duration-300 hover:scale-105">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-['Inter'] font-medium text-gray-400">{award.year}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-['Inter'] font-bold bg-gradient-to-r ${award.gradient} text-white`}>
                      {award.position}
                    </span>
                  </div>
                  <h4 className="font-['Space_Grotesk'] text-base font-bold text-white mb-2">
                    {award.demo}
                  </h4>
                  <p className="font-['Inter'] text-sm text-gray-400 mb-1">
                    {award.event}
                  </p>
                  <p className="font-['Inter'] text-xs text-cyan-400">
                    {award.category}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Notable Achievements */}
          <div>
            <h3 className="font-['Space_Grotesk'] text-2xl font-bold text-white mb-8 text-center">
              Notable Achievements
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {achievements.map((achievement, index) => (
                <div key={index} className="bg-gradient-to-r from-pink-500/10 to-cyan-500/10 border border-pink-500/20 rounded-xl p-6 hover:from-pink-500/20 hover:to-cyan-500/20 transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-r from-pink-500 to-cyan-500 flex items-center justify-center">
                      <achievement.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="font-['Inter'] text-sm text-gray-300 leading-relaxed">
                      {achievement.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
