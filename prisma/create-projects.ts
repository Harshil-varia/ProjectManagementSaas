import { prisma } from '../lib/prisma'

async function createSampleProjects() {
  const projects = [
    {
      name: 'Website Development',
      description: 'Company website redesign',
      color: '#3b82f6'
    },
    {
      name: 'Mobile App',
      description: 'iOS and Android app development',
      color: '#10b981'
    },
    {
      name: 'Internal Tools',
      description: 'Internal productivity tools',
      color: '#f59e0b'
    }
  ]

  for (const project of projects) {
    await prisma.project.create({
      data: project
    })
  }
  
  console.log('Sample projects created')
}

createSampleProjects()
  .catch(console.error)
  .finally(() => prisma.$disconnect())